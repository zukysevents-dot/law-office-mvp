// Pure mapper: Prisma Invoice (+ frozen snapshots + lines) → the primitive
// IsdocInvoiceInput consumed by the ISDOC generator. This is where all the
// "can this invoice be exported?" domain rules live, plus Decimal→string and
// Date→"YYYY-MM-DD" formatting. No DB / Prisma client import — it's structurally
// typed and unit-testable. The same DTO is the future seam for a Pohoda exporter.

import { round2 } from "@/lib/billing-calc";

import {
  deterministicUuid,
  type IsdocInvoiceInput,
  type IsdocLine,
  type IsdocVatRecapEntry,
} from "@/lib/export/isdoc";

// Thrown for any invoice that must not be exported. The route translates it to
// HTTP 422 with this (Czech) message.
export class IsdocExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IsdocExportError";
  }
}

// Only immutable, issued documents may be exported — never a DRAFT (no number /
// snapshots yet) or a CANCELLED doc (not a valid invoice to import).
const EXPORTABLE_STATUSES = new Set([
  "ISSUED",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
]);

type DecimalLike = { toString(): string } | number | string;

export type InvoiceExportLine = {
  description: string;
  quantity: DecimalLike;
  unit: string;
  unitPriceCzk: DecimalLike;
  vatRate: DecimalLike;
  lineBaseCzk: DecimalLike;
  lineVatCzk: DecimalLike;
  amountCzk: DecimalLike;
  position: number;
};

export type InvoiceExportRecord = {
  id: string;
  number: string | null;
  variableSymbol: string | null;
  status: string;
  vatMode: string;
  currency: string;
  note: string | null;
  issueDate: Date | null;
  taxDate: Date | null;
  dueDate: Date | null;
  subtotalCzk: DecimalLike;
  vatCzk: DecimalLike;
  totalCzk: DecimalLike;
  supplierSnapshot: unknown;
  customerSnapshot: unknown;
  lines: InvoiceExportLine[];
};

function money(value: DecimalLike): string {
  const amount = round2(Number(value.toString()));
  if (!Number.isFinite(amount)) {
    throw new IsdocExportError("Faktura obsahuje neplatnou částku.");
  }
  return amount.toFixed(2);
}

// Calendar date in ISDOC's "YYYY-MM-DD" form, read from UTC components so a
// midnight-UTC value never shifts to the previous day in a +TZ runtime.
function isoDateUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function mapInvoiceToIsdocInput(
  invoice: InvoiceExportRecord,
): IsdocInvoiceInput {
  if (!EXPORTABLE_STATUSES.has(invoice.status)) {
    throw new IsdocExportError(
      "Exportovat lze jen vystavenou fakturu (ne koncept ani stornovanou).",
    );
  }
  if (!invoice.number) {
    throw new IsdocExportError("Faktura nemá přidělené číslo.");
  }
  if (!invoice.issueDate) {
    throw new IsdocExportError("Faktura nemá datum vystavení.");
  }
  if (invoice.lines.length === 0) {
    throw new IsdocExportError("Faktura nemá žádné položky.");
  }

  const supplierSnap = asRecord(invoice.supplierSnapshot);
  const customerSnap = asRecord(invoice.customerSnapshot);
  if (!supplierSnap || !customerSnap) {
    throw new IsdocExportError("Faktura nemá zmrazené fakturační údaje.");
  }

  const vatApplicable = invoice.vatMode === "PAYER";
  const supplierDic = asText(supplierSnap.dic);
  if (vatApplicable && !supplierDic) {
    throw new IsdocExportError(
      "Plátce DPH musí mít vyplněné DIČ dodavatele (zkontrolujte fakturační profil).",
    );
  }

  const supplierName = asText(supplierSnap.legalName);
  const customerName = asText(customerSnap.name);
  if (!supplierName || !customerName) {
    throw new IsdocExportError("Faktura nemá název dodavatele nebo odběratele.");
  }

  const lines: IsdocLine[] = invoice.lines.map((line, index) => ({
    id: String(line.position || index + 1),
    description: line.description,
    quantity: money(line.quantity),
    unit: line.unit,
    unitPrice: money(line.unitPriceCzk),
    vatRate: money(line.vatRate),
    lineBase: money(line.lineBaseCzk),
    lineVat: money(line.lineVatCzk),
    lineTotal: money(line.amountCzk),
  }));

  // VAT recap grouped by rate. Sum the already-frozen per-line amounts — never
  // recompute — so the recap reconciles exactly with the stored header totals.
  const recapByRate = new Map<string, IsdocVatRecapEntry>();
  for (const line of invoice.lines) {
    const rate = money(line.vatRate);
    const base = round2(Number(line.lineBaseCzk.toString()));
    const vat = round2(Number(line.lineVatCzk.toString()));
    const total = round2(Number(line.amountCzk.toString()));
    const existing = recapByRate.get(rate);
    if (existing) {
      existing.taxableAmount = (
        Number(existing.taxableAmount) + base
      ).toFixed(2);
      existing.taxAmount = (Number(existing.taxAmount) + vat).toFixed(2);
      existing.taxInclusiveAmount = (
        Number(existing.taxInclusiveAmount) + total
      ).toFixed(2);
    } else {
      recapByRate.set(rate, {
        vatRate: rate,
        taxableAmount: base.toFixed(2),
        taxAmount: vat.toFixed(2),
        taxInclusiveAmount: total.toFixed(2),
      });
    }
  }

  return {
    uuid: deterministicUuid(invoice.id),
    number: invoice.number,
    variableSymbol: invoice.variableSymbol,
    issueDate: isoDateUtc(invoice.issueDate),
    taxDate: invoice.taxDate ? isoDateUtc(invoice.taxDate) : null,
    dueDate: invoice.dueDate ? isoDateUtc(invoice.dueDate) : null,
    currency: invoice.currency || "CZK",
    vatApplicable,
    note: invoice.note,
    supplier: {
      name: supplierName,
      ico: asText(supplierSnap.ico),
      dic: supplierDic,
      address: asText(supplierSnap.address),
      bankAccount: asText(supplierSnap.bankAccount),
      iban: asText(supplierSnap.iban),
    },
    customer: {
      name: customerName,
      ico: asText(customerSnap.ico),
      dic: asText(customerSnap.dic),
      address: asText(customerSnap.address),
    },
    lines,
    vatRecap: [...recapByRate.values()],
    taxExclusiveTotal: money(invoice.subtotalCzk),
    taxTotal: money(invoice.vatCzk),
    taxInclusiveTotal: money(invoice.totalCzk),
    payableAmount: money(invoice.totalCzk),
  };
}

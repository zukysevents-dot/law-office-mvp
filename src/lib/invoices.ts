import type { Prisma } from "@/generated/prisma/client";
import { InvoiceStatus, VatMode } from "@/generated/prisma/enums";

// CZ standard VAT rate used for auto-generated invoice lines.
export const DEFAULT_VAT_RATE = 21;

export const invoiceListInclude = {
  subject: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

export const invoiceDetailInclude = {
  subject: {
    select: {
      id: true,
      name: true,
      ico: true,
      dic: true,
      address: true,
      vatPayer: true,
    },
  },
  project: { select: { id: true, name: true } },
  case: { select: { id: true, name: true, fileNumber: true } },
  lines: { orderBy: { position: "asc" } },
  payments: { orderBy: { paidAt: "desc" } },
  reminders: { orderBy: { sentAt: "desc" } },
  createdBy: { select: { name: true } },
  issuedBy: { select: { name: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceListRow = Prisma.InvoiceGetPayload<{
  include: typeof invoiceListInclude;
}>;

export type InvoiceDetail = Prisma.InvoiceGetPayload<{
  include: typeof invoiceDetailInclude;
}>;

// A draft invoice can be edited/issued/deleted; ISSUED and later are immutable
// (only status transitions: pay, cancel).
export function isDraft(status: string): boolean {
  return status === "DRAFT";
}

// vatMode for a new invoice, derived from the issuer's billing profile. Unknown
// / non-payer → NON_PAYER (fail-safe: never charge VAT we shouldn't).
export function vatModeForProfile(
  profileVatPayer: boolean | null | undefined,
): VatMode {
  return profileVatPayer ? VatMode.PAYER : VatMode.NON_PAYER;
}

// Gap-free invoice number ve tvaru PREFIX_ROK_MĚSÍC_pořadové, pořadové číslo
// vždy na 4 místa. Prázdný prefix se vynechá.
//   formatInvoiceNumber("AK", 2026, 6, 1) → "AK_2026_06_0001"
//   formatInvoiceNumber("", 2026, 6, 1)   → "2026_06_0001"
export function formatInvoiceNumber(
  prefix: string,
  year: number,
  month: number,
  seq: number,
): string {
  const parts = [
    prefix.trim(),
    String(year),
    String(month).padStart(2, "0"),
    String(seq).padStart(4, "0"),
  ].filter((part) => part.length > 0);
  return parts.join("_");
}

// Invoice status after recording a payment: fully covered → PAID, otherwise
// PARTIALLY_PAID. (recordPayment only ever adds a positive amount.)
export function resolvePaidStatus(
  totalCzk: number,
  paidCzk: number,
): InvoiceStatus {
  return paidCzk >= totalCzk ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
}

// Statuses that can still go overdue (an unpaid receivable). PAID and CANCELLED
// never are; DRAFT has no due date yet.
const OVERDUE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
];

// "Po splatnosti": an outstanding invoice whose due date has already passed.
// Derived (not a stored status), so it composes with PARTIALLY_PAID. `now` is
// injectable for deterministic tests.
export function isPastDue(
  invoice: { dueDate: Date | null; status: InvoiceStatus },
  now: Date = new Date(),
): boolean {
  return (
    invoice.dueDate != null &&
    invoice.dueDate.getTime() < now.getTime() &&
    OVERDUE_STATUSES.includes(invoice.status)
  );
}

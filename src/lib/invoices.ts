import type { Prisma } from "@/generated/prisma/client";
import { VatMode } from "@/generated/prisma/enums";

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

// Gap-free invoice number, e.g. prefix="" year=2026 seq=1 → "20260001".
export function formatInvoiceNumber(
  prefix: string,
  year: number,
  seq: number,
): string {
  return `${prefix}${year}${String(seq).padStart(4, "0")}`;
}

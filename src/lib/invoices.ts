import type { Prisma } from "@/generated/prisma/client";
import {
  ApprovalStatus,
  BillingStatus,
  InvoiceStatus,
  SubjectContactType,
  VatMode,
} from "@/generated/prisma/enums";

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
      email: true,
      vatPayer: true,
      // All e-mails of the client: default recipient (an address labelled
      // "fakturace" wins) and suggestions in the send form.
      contacts: {
        where: { type: SubjectContactType.EMAIL },
        orderBy: { position: "asc" },
        select: { type: true, value: true, label: true, isPrimary: true },
      },
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

type InvoiceableWorkLogState = {
  id: string;
  organizationId: string;
  archivedAt: Date | null;
  billingStatus: BillingStatus;
  approvalStatus: ApprovalStatus;
  invoicedAt: Date | null;
};

// Validate rows only AFTER the caller has acquired row locks. Besides checking
// the business state, the exact id-set comparison catches missing/cross-tenant
// rows and duplicate/corrupt invoice-line references without issuing partially.
export function areLockedWorkLogsInvoiceable(
  rows: InvoiceableWorkLogState[],
  expectedIds: string[],
  organizationId: string,
): boolean {
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length || rows.length !== expected.size) {
    return false;
  }

  return rows.every(
    (row) =>
      expected.has(row.id) &&
      row.organizationId === organizationId &&
      row.archivedAt === null &&
      row.billingStatus === BillingStatus.BILLABLE &&
      row.approvalStatus === ApprovalStatus.APPROVED &&
      row.invoicedAt === null,
  );
}

/**
 * Return the exact source work-log ids for an invoice, or null when a line is
 * not backed by a work-log / the same work-log is referenced twice. LawOffice
 * invoices are generated from approved work logs, so issuing a detached manual
 * line would break the audit trail and is rejected.
 */
export function invoiceLineWorkLogIds(
  lines: Array<{ workLogId: string | null }>,
): string[] | null {
  const ids: string[] = [];
  const unique = new Set<string>();

  for (const line of lines) {
    if (!line.workLogId || unique.has(line.workLogId)) {
      return null;
    }
    unique.add(line.workLogId);
    ids.push(line.workLogId);
  }

  return ids;
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

export const INVOICE_MATTER_MISMATCH_MESSAGE =
  "Vybraný projekt nebo případ nepatří zvolenému klientovi.";

/**
 * Normalizes the project/case chosen for a new invoice (URL params of the
 * "Nová faktura" picker) against the client: a project of another client is
 * dropped together with the case, a case of another project/client is dropped
 * alone, and a case chosen without a project back-fills its project. Only IDs
 * from the loaded lists survive, so a stale/forged URL can't reach the form.
 */
export function normalizeInvoiceMatter(
  selection: { subjectId: string; projectId: string; caseId: string },
  projects: Array<{ id: string; mainSubjectId: string | null }>,
  cases: Array<{ id: string; projectId: string | null; mainSubjectId: string | null }>,
): { projectId: string; caseId: string } {
  if (!selection.subjectId) {
    return { projectId: "", caseId: "" };
  }
  let projectId = "";
  if (selection.projectId) {
    const project = projects.find((item) => item.id === selection.projectId);
    if (!project || project.mainSubjectId !== selection.subjectId) {
      return { projectId: "", caseId: "" };
    }
    projectId = project.id;
  }
  if (!selection.caseId) {
    return { projectId, caseId: "" };
  }
  const legalCase = cases.find((item) => item.id === selection.caseId);
  if (
    !legalCase ||
    !legalCase.projectId ||
    legalCase.mainSubjectId !== selection.subjectId ||
    (projectId && legalCase.projectId !== projectId)
  ) {
    return { projectId, caseId: "" };
  }
  return { projectId: legalCase.projectId, caseId: legalCase.id };
}

import type { Prisma } from "@/generated/prisma/client";
import { ApprovalStatus, BillingStatus } from "@/generated/prisma/enums";
import { parseDateBoundary } from "@/lib/search-params";

export type BillingFilters = {
  subjectId: string;
  projectId: string;
  caseId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
};

// A work log is part of the billing basis ("k fakturaci") when it is billable,
// approved, and not yet placed on an invoice. See Fáze 2H plan.
export const invoiceableWorkLogWhere: Prisma.WorkLogWhereInput = {
  archivedAt: null,
  billingStatus: BillingStatus.BILLABLE,
  approvalStatus: ApprovalStatus.APPROVED,
  invoiceId: null,
};

// Work logs that still await an approval decision ("ke schválení").
export const pendingApprovalWorkLogWhere: Prisma.WorkLogWhereInput = {
  archivedAt: null,
  billingStatus: { not: BillingStatus.INTERNAL_NON_BILLABLE },
  approvalStatus: {
    in: [
      ApprovalStatus.DRAFT,
      ApprovalStatus.SUBMITTED,
      ApprovalStatus.ADJUSTED,
    ],
  },
};

export const billingWorkLogInclude = {
  subject: { select: { name: true } },
  project: { select: { name: true } },
  case: { select: { name: true, fileNumber: true } },
  user: { select: { name: true } },
} satisfies Prisma.WorkLogInclude;

// Shared row shape for every billing surface (list, approvals, export) so the
// displayed/exported columns can't drift apart.
export type BillingWorkLog = Prisma.WorkLogGetPayload<{
  include: typeof billingWorkLogInclude;
}>;

// Upper bound on rows loaded into a single page / export to keep memory and
// DOM size bounded. When a query hits this cap, surface a notice rather than
// silently truncating.
export const BILLING_ROW_LIMIT = 2000;

// First/last day of the current month as YYYY-MM-DD.
export function currentMonthRange() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    dateFrom: fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    dateTo: fmt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))),
  };
}

export function readBillingFilters(
  get: (key: string) => string,
): BillingFilters {
  let dateFrom = get("dateFrom");
  let dateTo = get("dateTo");
  // Default the period to the whole current month; the user can widen/change it.
  if (!dateFrom && !dateTo) {
    ({ dateFrom, dateTo } = currentMonthRange());
  }
  return {
    subjectId: get("subjectId"),
    projectId: get("projectId"),
    caseId: get("caseId"),
    userId: get("userId"),
    dateFrom,
    dateTo,
  };
}

export function billingFilterWhere(
  filters: BillingFilters,
): Prisma.WorkLogWhereInput {
  const gte = parseDateBoundary(filters.dateFrom, false);
  const lte = parseDateBoundary(filters.dateTo, true);
  return {
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(gte || lte
      ? {
          workDate: {
            ...(gte ? { gte } : {}),
            ...(lte ? { lte } : {}),
          },
        }
      : {}),
  };
}

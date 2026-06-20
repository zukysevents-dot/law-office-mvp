import type { Prisma } from "@/generated/prisma/client";
import { BillingStatus } from "@/generated/prisma/enums";

// Upper bound on rows loaded into a single report page so memory and DOM size
// stay bounded. When a query hits this cap, surface a notice (billing
// precedent) rather than silently truncating.
export const REPORT_ROW_LIMIT = 2000;

// Relations every report needs for its grouping labels. Shared so the page and
// the aggregations can't drift apart.
export const reportWorkLogInclude = {
  subject: { select: { name: true } },
  user: { select: { name: true } },
} satisfies Prisma.WorkLogInclude;

export type ReportWorkLog = Prisma.WorkLogGetPayload<{
  include: typeof reportWorkLogInclude;
}>;

export type ReportSummaryRow = {
  key: string;
  label: string;
  hours: number;
  amount: number;
  count: number;
};

// Decimal-safe numeric extraction. Never add Prisma Decimals directly — wrap in
// Number(... ?? 0) (see billing summarize()).
function hoursOf(row: ReportWorkLog) {
  return Number(row.hours ?? 0);
}

function amountOf(row: ReportWorkLog) {
  return Number(row.amountCzk ?? 0);
}

function group(
  rows: ReportWorkLog[],
  keyOf: (row: ReportWorkLog) => string,
  labelOf: (row: ReportWorkLog) => string,
): ReportSummaryRow[] {
  const map = new Map<string, ReportSummaryRow>();
  for (const row of rows) {
    const key = keyOf(row);
    const entry =
      map.get(key) ?? { key, label: labelOf(row), hours: 0, amount: 0, count: 0 };
    entry.hours += hoursOf(row);
    entry.amount += amountOf(row);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

const CZECH_MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

// Group by calendar month (key "YYYY-MM", Czech label). workDate is stored at
// UTC midnight, so read its UTC parts to keep the bucket stable across hosts.
export function byMonth(rows: ReportWorkLog[]): ReportSummaryRow[] {
  return group(
    rows,
    (row) => {
      const date = row.workDate;
      const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
      return `${date.getUTCFullYear()}-${month}`;
    },
    (row) => {
      const date = row.workDate;
      return `${CZECH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    },
  ).sort((a, b) => a.key.localeCompare(b.key));
}

export function byUser(rows: ReportWorkLog[]): ReportSummaryRow[] {
  return group(
    rows,
    (row) => row.userId ?? "",
    (row) => row.user?.name ?? "Bez pracovníka",
  );
}

export function byLegalArea(rows: ReportWorkLog[]): ReportSummaryRow[] {
  return group(
    rows,
    (row) => row.legalArea?.trim() || "",
    (row) => row.legalArea?.trim() || "Bez právní oblasti",
  );
}

export function bySubject(rows: ReportWorkLog[]): ReportSummaryRow[] {
  return group(
    rows,
    (row) => row.subjectId ?? "",
    (row) => row.subject?.name ?? "Bez klienta",
  );
}

export type BillabilityKpi = {
  billableHours: number;
  nonBillableHours: number;
  needsApprovalHours: number;
  totalHours: number;
  // billable hours ÷ total logged hours (utilization), 0 when no hours logged.
  ratio: number;
  billableAmount: number;
  billableCount: number;
  nonBillableCount: number;
  needsApprovalCount: number;
  totalCount: number;
};

// Billability KPI / utilization = billable hours ÷ total logged hours.
//   - "Billable"     = billingStatus === BILLABLE (regardless of approval).
//   - "Non-billable" = billingStatus === INTERNAL_NON_BILLABLE.
//   - "Needs approval" = billingStatus === NEEDS_APPROVAL — pending, so it is
//     NOT counted as billable for the ratio (it stays in the total).
export function billabilityKpi(rows: ReportWorkLog[]): BillabilityKpi {
  const kpi: BillabilityKpi = {
    billableHours: 0,
    nonBillableHours: 0,
    needsApprovalHours: 0,
    totalHours: 0,
    ratio: 0,
    billableAmount: 0,
    billableCount: 0,
    nonBillableCount: 0,
    needsApprovalCount: 0,
    totalCount: 0,
  };

  for (const row of rows) {
    const hours = hoursOf(row);
    kpi.totalHours += hours;
    kpi.totalCount += 1;

    if (row.billingStatus === BillingStatus.BILLABLE) {
      kpi.billableHours += hours;
      kpi.billableAmount += amountOf(row);
      kpi.billableCount += 1;
    } else if (row.billingStatus === BillingStatus.INTERNAL_NON_BILLABLE) {
      kpi.nonBillableHours += hours;
      kpi.nonBillableCount += 1;
    } else {
      kpi.needsApprovalHours += hours;
      kpi.needsApprovalCount += 1;
    }
  }

  kpi.ratio = kpi.totalHours > 0 ? kpi.billableHours / kpi.totalHours : 0;
  return kpi;
}

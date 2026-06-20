import type { Prisma } from "@/generated/prisma/client";

// Filters shared by every report view and export. Mirrors billing.ts but adds
// `legalArea` and always scopes to active (non-archived) work logs.
export type ReportFilters = {
  subjectId: string;
  projectId: string;
  caseId: string;
  userId: string;
  legalArea: string;
  dateFrom: string;
  dateTo: string;
};

export function readReportFilters(
  get: (key: string) => string,
): ReportFilters {
  return {
    subjectId: get("subjectId"),
    projectId: get("projectId"),
    caseId: get("caseId"),
    userId: get("userId"),
    legalArea: get("legalArea"),
    dateFrom: get("dateFrom"),
    dateTo: get("dateTo"),
  };
}

// Parse a YYYY-MM-DD filter value into a UTC day boundary. Returns undefined for
// empty or malformed input so a bad query string can't throw a Prisma error
// (which would surface as a misleading 503 / "database not ready" notice).
function parseDateBoundary(value: string, endOfDay: boolean): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value}T${time}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function workLogReportWhere(
  filters: ReportFilters,
): Prisma.WorkLogWhereInput {
  const gte = parseDateBoundary(filters.dateFrom, false);
  const lte = parseDateBoundary(filters.dateTo, true);
  return {
    archivedAt: null,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.legalArea ? { legalArea: filters.legalArea } : {}),
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

// Serialize the active filters into a query string so report links and export
// links can carry the current selection.
export function reportFilterQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  return params.toString();
}

import type { Prisma } from "@/generated/prisma/client";

import { parseDateBoundary } from "@/lib/search-params";

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

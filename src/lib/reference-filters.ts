import type { Prisma } from "@/generated/prisma/client";

export type ReferenceFilters = {
  q: string;
  legalArea: string;
  minValue: number | null;
  maxValue: number | null;
  period: string; // "" | "ongoing" | "finished"
};

function numberParam(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// Read the reference list filters from a query getter. Shared by the list page
// and the export route so "filter, then export" stays in sync.
export function readReferenceFilters(
  get: (key: string) => string | undefined,
): ReferenceFilters {
  return {
    q: (get("q") ?? "").trim(),
    legalArea: get("legalArea") ?? "",
    minValue: numberParam(get("minValue")),
    maxValue: numberParam(get("maxValue")),
    period: get("period") ?? "",
  };
}

// Prisma where fragment for the reference filters (compose with archive +
// visibility via andWhere).
export function referenceFilterWhere(
  filters: ReferenceFilters,
): Prisma.ReferenceWhereInput {
  const { q, legalArea, minValue, maxValue, period } = filters;
  return {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { legalArea: { contains: q, mode: "insensitive" } },
            { project: { is: { name: { contains: q, mode: "insensitive" } } } },
            { case: { is: { name: { contains: q, mode: "insensitive" } } } },
            { subject: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(legalArea ? { legalArea } : {}),
    ...(minValue !== null || maxValue !== null
      ? {
          valueCzk: {
            ...(minValue !== null ? { gte: minValue } : {}),
            ...(maxValue !== null ? { lte: maxValue } : {}),
          },
        }
      : {}),
    ...(period === "ongoing" ? { endDate: null } : {}),
    ...(period === "finished" ? { endDate: { not: null } } : {}),
  };
}

// Build a query string of the active reference filters (for the export link).
export function referenceFilterQuery(
  filters: ReferenceFilters,
  archive: string,
): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.legalArea) p.set("legalArea", filters.legalArea);
  if (filters.minValue !== null) p.set("minValue", String(filters.minValue));
  if (filters.maxValue !== null) p.set("maxValue", String(filters.maxValue));
  if (filters.period) p.set("period", filters.period);
  if (archive) p.set("archive", archive);
  return p.toString();
}

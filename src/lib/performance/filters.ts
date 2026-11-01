// Query parametry stránky Výkonnost (a jejího exportu). Čistý modul.

import {
  isPerformanceSortKey,
  NO_TEAM,
  type PerformanceSortKey,
  type SortDirection,
} from "@/lib/performance/metrics";
import type { PerformancePeriodInput } from "@/lib/performance/period";

const ROLE_VALUES = ["ADMIN", "PARTNER", "LAWYER", "TRAINEE", "INTERN"] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type PerformanceFilters = {
  period: PerformancePeriodInput;
  teamId: string | null;
  role: (typeof ROLE_VALUES)[number] | null;
  userId: string | null;
  sort: PerformanceSortKey;
  dir: SortDirection;
};

function id(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function readPerformanceFilters(
  get: (key: string) => string | null | undefined,
): PerformanceFilters {
  const teamRaw = get("teamId")?.trim() ?? "";
  const roleRaw = get("role")?.trim() ?? "";
  const sortRaw = get("sort")?.trim() ?? "";
  return {
    period: {
      period: get("period") ?? null,
      from: get("from") ?? null,
      to: get("to") ?? null,
      anchor: get("anchor") ?? null,
    },
    teamId: teamRaw === NO_TEAM ? NO_TEAM : id(teamRaw),
    role: (ROLE_VALUES as readonly string[]).includes(roleRaw)
      ? (roleRaw as PerformanceFilters["role"])
      : null,
    userId: id(get("userId")),
    sort: isPerformanceSortKey(sortRaw) ? sortRaw : "name",
    dir: get("dir") === "desc" ? "desc" : "asc",
  };
}

// Ne-periodické filtry jako query parametry (pro odkazy: řazení, období,
// detail, export). Výchozí hodnoty se vynechávají.
export function performanceFilterParams(
  filters: Pick<PerformanceFilters, "teamId" | "role" | "userId" | "sort" | "dir">,
  options: { includeSort?: boolean } = {},
): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.teamId) params.teamId = filters.teamId;
  if (filters.role) params.role = filters.role;
  if (filters.userId) params.userId = filters.userId;
  if (options.includeSort !== false && filters.sort !== "name") params.sort = filters.sort;
  if (options.includeSort !== false && filters.dir !== "asc") params.dir = filters.dir;
  return params;
}

export function toQuery(...parts: Array<Record<string, string>>): string {
  const search = new URLSearchParams();
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (value) {
        search.set(key, value);
      }
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

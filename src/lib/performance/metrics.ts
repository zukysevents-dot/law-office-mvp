// Výpočty pro stránku Výkonnost: rozdělení hodin, sloučení počtů úkolů,
// absence v období, vytížení, řádky tabulky, filtrování, řazení a součty.
// Čistá logika bez DB — data dodá load.server.ts (agregace groupBy).

import { countWeekdays } from "@/lib/hr/absence-calc";
import {
  DAY_MS,
  EMPTY_HOURS_PLAN,
  fulfillmentPercent,
  isBillableKpiHours,
  periodTargets,
  type HoursPlanTargets,
} from "@/lib/hours-plan";

// --- Hodiny -----------------------------------------------------------------

export type HoursGroup = {
  billingStatus: string;
  approvalStatus: string;
  hours: number;
};

export type HoursSplit = {
  total: number;
  billable: number;
  approvedBillable: number;
  nonBillable: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export const EMPTY_HOURS_SPLIT: HoursSplit = {
  total: 0,
  billable: 0,
  approvedBillable: 0,
  nonBillable: 0,
};

// Fakturovatelné pro KPI = isBillableKpiHours (BILLABLE / legacy NEEDS_APPROVAL,
// ne zamítnuté); vše ostatní je nefakturovatelné.
export function classifyHours(groups: readonly HoursGroup[]): HoursSplit {
  let total = 0;
  let billable = 0;
  let approvedBillable = 0;
  for (const group of groups) {
    const hours = Math.max(0, Number.isFinite(group.hours) ? group.hours : 0);
    total += hours;
    if (isBillableKpiHours(group.billingStatus, group.approvalStatus)) {
      billable += hours;
      if (group.approvalStatus === "APPROVED") {
        approvedBillable += hours;
      }
    }
  }
  return {
    total: round2(total),
    billable: round2(billable),
    approvedBillable: round2(approvedBillable),
    nonBillable: round2(total - billable),
  };
}

// --- Počty ------------------------------------------------------------------

export type CountMap = Map<string, number>;

// Sečte počty z více groupBy (řádky řešitelů + legacy assignedToId).
export function mergeCounts(
  ...sources: Array<ReadonlyArray<{ key: string | null; count: number }> | CountMap>
): CountMap {
  const result: CountMap = new Map();
  for (const source of sources) {
    const entries =
      source instanceof Map
        ? [...source.entries()].map(([key, count]) => ({ key, count }))
        : source;
    for (const { key, count } of entries) {
      if (!key) {
        continue;
      }
      result.set(key, (result.get(key) ?? 0) + count);
    }
  }
  return result;
}

// --- Absence ----------------------------------------------------------------

export type AbsenceInput = {
  type: string;
  startDate: Date;
  endDate: Date;
  halfDay: boolean;
};

export type AbsenceSummary = {
  days: number;
  byType: Record<string, number>;
};

// Pracovní dny absencí (Po–Pá) v průniku s obdobím [from, toExcl). Půlden =
// 0,5 dne. Home office není absence (pracuje se), proto se nepočítá.
export function absenceDaysInRange(
  absences: readonly AbsenceInput[],
  fromMs: number,
  toExclusiveMs: number,
): AbsenceSummary {
  const byType: Record<string, number> = {};
  let days = 0;
  for (const absence of absences) {
    if (absence.type === "HOME_OFFICE") {
      continue;
    }
    const start = Math.max(absence.startDate.getTime(), fromMs);
    const end = Math.min(absence.endDate.getTime(), toExclusiveMs - DAY_MS);
    if (end < start) {
      continue;
    }
    const weekdays = countWeekdays(new Date(start), new Date(end));
    const value = absence.halfDay ? weekdays * 0.5 : weekdays;
    if (value <= 0) {
      continue;
    }
    days += value;
    byType[absence.type] = (byType[absence.type] ?? 0) + value;
  }
  return { days, byType };
}

// --- Vytížení ---------------------------------------------------------------

export const WORKLOAD_MEDIUM = 8;
export const WORKLOAD_HIGH = 16;

export type WorkloadLevel = "LOW" | "MEDIUM" | "HIGH";

// Skóre = otevřené úkoly + po termínu + termíny do 14 dnů. Úkol po termínu
// nebo s blížícím se termínem se tak počítá víckrát — váží víc než úkol bez
// tlaku na čas.
export function workloadScore(open: number, overdue: number, upcoming: number) {
  return open + overdue + upcoming;
}

export function workloadLevel(score: number): WorkloadLevel {
  if (score >= WORKLOAD_HIGH) {
    return "HIGH";
  }
  if (score >= WORKLOAD_MEDIUM) {
    return "MEDIUM";
  }
  return "LOW";
}

// --- Řádky tabulky ----------------------------------------------------------

export type PerformanceMember = {
  userId: string;
  name: string;
  role: string;
  teamId: string | null;
  teamName: string | null;
};

export type PerformanceHr = {
  hasEmployee: boolean;
  workedDays: number;
  workedHours: number;
  absence: AbsenceSummary;
};

export type PerformanceRow = PerformanceMember & {
  hours: HoursSplit;
  totalTarget: number | null;
  billableTarget: number | null;
  totalPct: number | null;
  billablePct: number | null;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  upcomingTasks: number;
  upcomingDeadlines: number;
  upcomingTotal: number;
  workloadScore: number;
  workload: WorkloadLevel;
  hr: PerformanceHr | null;
};

export type PerformanceHrInput = {
  employeeByUser: Map<string, string>;
  attendance: Map<string, { days: number; hours: number }>;
  absences: Map<string, AbsenceInput[]>;
};

export type PerformanceRowsInput = {
  members: readonly PerformanceMember[];
  plans: Map<string, HoursPlanTargets>;
  hours: Map<string, HoursGroup[]>;
  openTasks: CountMap;
  overdueTasks: CountMap;
  completedTasks: CountMap;
  upcomingTasks: CountMap;
  upcomingDeadlines: CountMap;
  hr: PerformanceHrInput | null;
  fromMs: number;
  toExclusiveMs: number;
};

export function buildPerformanceRows(input: PerformanceRowsInput): PerformanceRow[] {
  return input.members.map((member) => {
    const hours = classifyHours(input.hours.get(member.userId) ?? []);
    const plan = input.plans.get(member.userId) ?? EMPTY_HOURS_PLAN;
    const targets = periodTargets(plan, input.fromMs, input.toExclusiveMs);
    const openTasks = input.openTasks.get(member.userId) ?? 0;
    const overdueTasks = input.overdueTasks.get(member.userId) ?? 0;
    const upcomingTasks = input.upcomingTasks.get(member.userId) ?? 0;
    const upcomingDeadlines = input.upcomingDeadlines.get(member.userId) ?? 0;
    const upcomingTotal = upcomingTasks + upcomingDeadlines;
    const score = workloadScore(openTasks, overdueTasks, upcomingTotal);

    let hr: PerformanceHr | null = null;
    if (input.hr) {
      const employeeId = input.hr.employeeByUser.get(member.userId);
      const attendance = employeeId ? input.hr.attendance.get(employeeId) : undefined;
      hr = {
        hasEmployee: Boolean(employeeId),
        workedDays: attendance?.days ?? 0,
        workedHours: round2(attendance?.hours ?? 0),
        absence: employeeId
          ? absenceDaysInRange(
              input.hr.absences.get(employeeId) ?? [],
              input.fromMs,
              input.toExclusiveMs,
            )
          : { days: 0, byType: {} },
      };
    }

    return {
      ...member,
      hours,
      totalTarget: targets.total,
      billableTarget: targets.billable,
      totalPct: fulfillmentPercent(hours.total, targets.total),
      billablePct: fulfillmentPercent(hours.billable, targets.billable),
      openTasks,
      overdueTasks,
      completedTasks: input.completedTasks.get(member.userId) ?? 0,
      upcomingTasks,
      upcomingDeadlines,
      upcomingTotal,
      workloadScore: score,
      workload: workloadLevel(score),
      hr,
    };
  });
}

// --- Filtry -----------------------------------------------------------------

export const NO_TEAM = "none";

export type PerformanceRowFilters = {
  teamId?: string | null;
  role?: string | null;
  userId?: string | null;
};

// Filtry nad členy (před dotazy) i nad řádky. teamId „none“ = bez týmu.
export function filterPerformanceRows<T extends PerformanceMember>(
  rows: readonly T[],
  filters: PerformanceRowFilters,
): T[] {
  return rows.filter((row) => {
    if (filters.teamId) {
      if (filters.teamId === NO_TEAM ? row.teamId !== null : row.teamId !== filters.teamId) {
        return false;
      }
    }
    if (filters.role && row.role !== filters.role) {
      return false;
    }
    if (filters.userId && row.userId !== filters.userId) {
      return false;
    }
    return true;
  });
}

// --- Řazení -----------------------------------------------------------------

export const PERFORMANCE_SORT_KEYS = [
  "name",
  "total",
  "billable",
  "nonBillable",
  "open",
  "overdue",
  "completed",
  "upcoming",
  "workload",
  "attendance",
  "absence",
] as const;

export type PerformanceSortKey = (typeof PERFORMANCE_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export function isPerformanceSortKey(value: string | null | undefined): value is PerformanceSortKey {
  return Boolean(value) && (PERFORMANCE_SORT_KEYS as readonly string[]).includes(value as string);
}

// Hodnota pro řazení; null (bez karty zaměstnance) jde vždy na konec.
function sortValue(row: PerformanceRow, key: PerformanceSortKey): number | null {
  switch (key) {
    case "total":
      return row.hours.total;
    case "billable":
      return row.hours.billable;
    case "nonBillable":
      return row.hours.nonBillable;
    case "open":
      return row.openTasks;
    case "overdue":
      return row.overdueTasks;
    case "completed":
      return row.completedTasks;
    case "upcoming":
      return row.upcomingTotal;
    case "workload":
      return row.workloadScore;
    case "attendance":
      return row.hr?.hasEmployee ? row.hr.workedHours : null;
    case "absence":
      return row.hr?.hasEmployee ? row.hr.absence.days : null;
    default:
      return null;
  }
}

const collator = new Intl.Collator("cs", { sensitivity: "base" });

export function sortPerformanceRows(
  rows: readonly PerformanceRow[],
  key: PerformanceSortKey,
  direction: SortDirection,
): PerformanceRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") {
      return factor * collator.compare(a.name, b.name);
    }
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av == null && bv == null) {
      return collator.compare(a.name, b.name);
    }
    if (av == null) {
      return 1;
    }
    if (bv == null) {
      return -1;
    }
    if (av !== bv) {
      return factor * (av - bv);
    }
    return collator.compare(a.name, b.name);
  });
}

// --- Součty -----------------------------------------------------------------

export type PerformanceTotals = {
  hours: HoursSplit;
  totalTarget: number | null;
  billableTarget: number | null;
  // Hodiny a počet lidí, kteří příslušný cíl mají (základ pro % plnění).
  totalWithTarget: number;
  billableWithTarget: number;
  peopleWithTotalTarget: number;
  peopleWithBillableTarget: number;
  people: number;
  totalPct: number | null;
  billablePct: number | null;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  upcomingTotal: number;
  hr: { workedDays: number; workedHours: number; absenceDays: number } | null;
};

// Součty přes řádky. % plnění = hodiny lidí, kteří cíl mají, / součet cílů
// (lidé bez plánu by % uměle snižovali/zvyšovali).
export function performanceTotals(rows: readonly PerformanceRow[]): PerformanceTotals {
  const hours = { ...EMPTY_HOURS_SPLIT };
  let totalTarget: number | null = null;
  let billableTarget: number | null = null;
  let totalWithTarget = 0;
  let billableWithTarget = 0;
  let peopleWithTotalTarget = 0;
  let peopleWithBillableTarget = 0;
  let openTasks = 0;
  let overdueTasks = 0;
  let completedTasks = 0;
  let upcomingTotal = 0;
  let hr: PerformanceTotals["hr"] = null;

  for (const row of rows) {
    hours.total += row.hours.total;
    hours.billable += row.hours.billable;
    hours.approvedBillable += row.hours.approvedBillable;
    hours.nonBillable += row.hours.nonBillable;
    if (row.totalTarget != null && row.totalTarget > 0) {
      totalTarget = (totalTarget ?? 0) + row.totalTarget;
      totalWithTarget += row.hours.total;
      peopleWithTotalTarget += 1;
    }
    if (row.billableTarget != null && row.billableTarget > 0) {
      billableTarget = (billableTarget ?? 0) + row.billableTarget;
      billableWithTarget += row.hours.billable;
      peopleWithBillableTarget += 1;
    }
    openTasks += row.openTasks;
    overdueTasks += row.overdueTasks;
    completedTasks += row.completedTasks;
    upcomingTotal += row.upcomingTotal;
    if (row.hr) {
      hr ??= { workedDays: 0, workedHours: 0, absenceDays: 0 };
      hr.workedDays += row.hr.workedDays;
      hr.workedHours += row.hr.workedHours;
      hr.absenceDays += row.hr.absence.days;
    }
  }

  return {
    hours: {
      total: round2(hours.total),
      billable: round2(hours.billable),
      approvedBillable: round2(hours.approvedBillable),
      nonBillable: round2(hours.nonBillable),
    },
    totalTarget: totalTarget != null ? round2(totalTarget) : null,
    billableTarget: billableTarget != null ? round2(billableTarget) : null,
    totalWithTarget: round2(totalWithTarget),
    billableWithTarget: round2(billableWithTarget),
    peopleWithTotalTarget,
    peopleWithBillableTarget,
    people: rows.length,
    totalPct: fulfillmentPercent(totalWithTarget, totalTarget),
    billablePct: fulfillmentPercent(billableWithTarget, billableTarget),
    openTasks,
    overdueTasks,
    completedTasks,
    upcomingTotal,
    hr: hr ? { ...hr, workedHours: round2(hr.workedHours) } : null,
  };
}

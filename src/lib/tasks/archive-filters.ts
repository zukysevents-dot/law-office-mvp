// Filtry archivu úkolů (/tasks/archive): subjekt, projekt, případ, zadavatel,
// řešitel, dohled, název a časové rozpětí (tento / minulý měsíc, konkrétní
// měsíc např. „leden 2026“, vlastní od–do) nad zvoleným datem (dokončení /
// archivace, termín, založení). Parametry v URL, kombinovatelné. Čistý modul
// (unit testy) — volající skládá andWhere(taskArchiveWhere(...),
// taskVisibilityWhere(user)).

import type { Prisma } from "@/generated/prisma/client";
import {
  CALENDAR_DISPLAY_TIME_ZONE,
  utcToWallTime,
  zonedWallTimeToUtc,
} from "@/lib/calendar/windows-time-zones";
import type { SearchParamValue } from "@/lib/search-params";
import { formatTaskDeadline } from "@/lib/tasks/deadline-history";
import { taskAssigneeWhere, taskSupervisorWhere } from "@/lib/tasks/task-people";

export const TASK_ARCHIVE_DATE_FIELDS = ["closed", "deadline", "created"] as const;
export type TaskArchiveDateField = (typeof TASK_ARCHIVE_DATE_FIELDS)[number];

export const taskArchiveDateFieldLabels: Record<TaskArchiveDateField, string> = {
  closed: "Datum dokončení / archivace",
  deadline: "Termín (deadline)",
  created: "Datum založení",
};

// Shrnutí nad výsledky: „… dokončené nebo archivované v období leden 2026“.
const dateFieldSummary: Record<TaskArchiveDateField, string> = {
  closed: "dokončené nebo archivované",
  deadline: "s termínem",
  created: "založené",
};

export const MAX_ARCHIVE_MONTH_OPTIONS = 60;

export type TaskArchiveFilters = {
  subjectId: string;
  projectId: string;
  caseId: string;
  createdById: string;
  assigneeId: string;
  supervisorId: string;
  q: string;
  dateField: TaskArchiveDateField;
  /** "" | "this-month" | "last-month" | "YYYY-MM" | "custom" */
  period: string;
  /** `YYYY-MM-DD` nebo "" */
  dateFrom: string;
  dateTo: string;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUERY_LENGTH = 200;

function first(params: Record<string, SearchParamValue>, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function validId(value: string) {
  return ID_PATTERN.test(value) ? value : "";
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return "";
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

function validPeriod(value: string) {
  if (value === "this-month" || value === "last-month" || value === "custom") {
    return value;
  }
  const match = MONTH_PATTERN.exec(value);
  if (match) {
    const year = Number(match[1]);
    return year >= 1970 && year <= 9999 ? value : "";
  }
  return "";
}

/** Neplatné hodnoty se tiše ignorují (žádná 500 ani „databáze není připravena“). */
export function parseTaskArchiveFilters(
  params: Record<string, SearchParamValue>,
): TaskArchiveFilters {
  const rawField = first(params, "dateField");
  const dateField = (TASK_ARCHIVE_DATE_FIELDS as readonly string[]).includes(rawField)
    ? (rawField as TaskArchiveDateField)
    : "closed";
  const dateFrom = validDate(first(params, "dateFrom"));
  const dateTo = validDate(first(params, "dateTo"));
  // Vyplněné Od / Do = vlastní rozsah (přebije zvolené období).
  const period = dateFrom || dateTo ? "custom" : validPeriod(first(params, "period"));
  return {
    subjectId: validId(first(params, "subjectId")),
    projectId: validId(first(params, "projectId")),
    caseId: validId(first(params, "caseId")),
    createdById: validId(first(params, "createdById")),
    assigneeId: validId(first(params, "assigneeId")),
    supervisorId: validId(first(params, "supervisorId")),
    q: first(params, "q").slice(0, MAX_QUERY_LENGTH),
    dateField,
    period,
    dateFrom: period === "custom" ? dateFrom : "",
    dateTo: period === "custom" ? dateTo : "",
  };
}

export function hasActiveArchiveFilters(filters: TaskArchiveFilters) {
  return Boolean(
    filters.subjectId ||
      filters.projectId ||
      filters.caseId ||
      filters.createdById ||
      filters.assigneeId ||
      filters.supervisorId ||
      filters.q ||
      filters.period ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.dateField !== "closed",
  );
}

const monthLabelFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** „leden 2026“ */
export function monthLabel(year: number, month: number) {
  return monthLabelFormatter.format(new Date(Date.UTC(year, month - 1, 15)));
}

function monthKey(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 + 1 };
}

function pragueYearMonth(now: Date) {
  const wall = utcToWallTime(now, CALENDAR_DISPLAY_TIME_ZONE);
  return { year: wall.year, month: wall.month };
}

// Začátek kalendářního dne. Termín (deadline) je datum na UTC půlnoci, proto
// UTC; dokončení / archivace / založení jsou časové okamžiky, proto půlnoc
// v Praze (DST-safe).
function dayStart(
  year: number,
  month: number,
  day: number,
  dateField: TaskArchiveDateField,
): Date {
  if (dateField === "deadline") {
    return new Date(Date.UTC(year, month - 1, day));
  }
  // Normalizace přetečení (32. den → další měsíc) přes UTC.
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return zonedWallTimeToUtc(
    {
      year: normalized.getUTCFullYear(),
      month: normalized.getUTCMonth() + 1,
      day: normalized.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    CALENDAR_DISPLAY_TIME_ZONE,
  );
}

function isoParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export type TaskArchiveRange = {
  gte?: Date;
  lt?: Date;
  /** „leden 2026“, „01. 01. 2026 – 31. 01. 2026“, „od 01. 01. 2026“ */
  label: string;
};

export function resolveTaskArchiveRange(
  filters: Pick<TaskArchiveFilters, "dateField" | "period" | "dateFrom" | "dateTo">,
  now: Date,
): TaskArchiveRange | null {
  const { dateField, period } = filters;
  const monthRange = (year: number, month: number): TaskArchiveRange => {
    const next = shiftMonth(year, month, 1);
    return {
      gte: dayStart(year, month, 1, dateField),
      lt: dayStart(next.year, next.month, 1, dateField),
      label: monthLabel(year, month),
    };
  };

  if (period === "this-month" || period === "last-month") {
    const current = pragueYearMonth(now);
    const target =
      period === "this-month" ? current : shiftMonth(current.year, current.month, -1);
    return monthRange(target.year, target.month);
  }
  const monthMatch = MONTH_PATTERN.exec(period);
  if (monthMatch) {
    return monthRange(Number(monthMatch[1]), Number(monthMatch[2]));
  }
  if (period === "custom") {
    let from = filters.dateFrom;
    let to = filters.dateTo;
    if (from && to && from > to) {
      [from, to] = [to, from];
    }
    if (!from && !to) {
      return null;
    }
    const range: TaskArchiveRange = { label: "" };
    if (from) {
      const parts = isoParts(from);
      range.gte = dayStart(parts.year, parts.month, parts.day, dateField);
    }
    if (to) {
      const parts = isoParts(to);
      // Do = včetně celého dne (exkluzivně začátek dalšího dne).
      range.lt = dayStart(parts.year, parts.month, parts.day + 1, dateField);
    }
    const fromLabel = from ? formatTaskDeadline(new Date(`${from}T00:00:00.000Z`)) : "";
    const toLabel = to ? formatTaskDeadline(new Date(`${to}T00:00:00.000Z`)) : "";
    range.label =
      from && to ? `${fromLabel} – ${toLabel}` : from ? `od ${fromLabel}` : `do ${toLabel}`;
    return range;
  }
  return null;
}

/** „dokončené nebo archivované v období leden 2026“ (null = bez období). */
export function archiveRangeSummary(
  dateField: TaskArchiveDateField,
  range: TaskArchiveRange | null,
) {
  return range ? `${dateFieldSummary[dateField]} v období ${range.label}` : null;
}

function rangeWhere(range: TaskArchiveRange) {
  return {
    ...(range.gte ? { gte: range.gte } : {}),
    ...(range.lt ? { lt: range.lt } : {}),
  };
}

export function taskArchiveWhere(
  filters: TaskArchiveFilters,
  now: Date,
): Prisma.TaskWhereInput {
  const clauses: Prisma.TaskWhereInput[] = [{ archivedAt: { not: null } }];

  if (filters.subjectId) {
    // Úkol visí pod projektem (přímo) nebo pod případem (jehož projekt nese klienta).
    clauses.push({
      OR: [
        { project: { mainSubjectId: filters.subjectId } },
        { case: { project: { mainSubjectId: filters.subjectId } } },
      ],
    });
  }
  if (filters.projectId) {
    clauses.push({
      OR: [{ projectId: filters.projectId }, { case: { projectId: filters.projectId } }],
    });
  }
  if (filters.caseId) {
    clauses.push({ caseId: filters.caseId });
  }
  if (filters.createdById) {
    clauses.push({ createdById: filters.createdById });
  }
  if (filters.assigneeId) {
    clauses.push(taskAssigneeWhere(filters.assigneeId));
  }
  if (filters.supervisorId) {
    clauses.push(taskSupervisorWhere(filters.supervisorId));
  }
  if (filters.q) {
    clauses.push({ title: { contains: filters.q, mode: "insensitive" } });
  }

  const range = resolveTaskArchiveRange(filters, now);
  if (range) {
    const where = rangeWhere(range);
    if (filters.dateField === "deadline") {
      clauses.push({ deadline: where });
    } else if (filters.dateField === "created") {
      clauses.push({ createdAt: where });
    } else {
      // Ručně archivovaný (nedokončený) úkol nemá completedAt → archivedAt.
      clauses.push({
        OR: [{ completedAt: where }, { completedAt: null, archivedAt: where }],
      });
    }
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

export type ArchiveMonthOption = { value: string; label: string };

/** Měsíce od aktuálního (Praha) zpět k nejstaršímu archivovanému úkolu (max. 60). */
export function archiveMonthOptions(
  oldest: Date | null,
  now: Date,
  max = MAX_ARCHIVE_MONTH_OPTIONS,
): ArchiveMonthOption[] {
  const current = pragueYearMonth(now);
  const stop = oldest ? pragueYearMonth(oldest) : current;
  const stopIndex = stop.year * 12 + stop.month;
  const options: ArchiveMonthOption[] = [];
  for (let offset = 0; options.length < max; offset += 1) {
    const month = shiftMonth(current.year, current.month, -offset);
    if (offset > 0 && month.year * 12 + month.month < stopIndex) {
      break;
    }
    options.push({ value: monthKey(month.year, month.month), label: monthLabel(month.year, month.month) });
  }
  return options;
}

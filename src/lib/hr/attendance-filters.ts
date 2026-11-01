import type { Prisma } from "@/generated/prisma/client";
import { filterQuery, parseDateBoundary } from "@/lib/search-params";

// Filtry záznamů docházky (stránka /hr/attendance i export). Pure: žádná DB.
// workDate je kalendářní den uložený na UTC půlnoc, takže hranice období jsou
// UTC dny „od" 00:00 a „do" 23:59:59.999.

export type AttendanceFilters = {
  /** RRRR-MM-DD nebo "" */
  from: string;
  /** RRRR-MM-DD nebo "" */
  to: string;
  /** id karty zaměstnance nebo "" (všichni viditelní) */
  employeeId: string;
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function dateValue(value: string): string {
  const trimmed = value.trim();
  return parseDateBoundary(trimmed, false) &&
    new Date(`${trimmed}T00:00:00.000Z`).toISOString().slice(0, 10) === trimmed
    ? trimmed
    : "";
}

// Neplatné hodnoty z URL se zahodí (žádná výjimka → žádná falešná hláška
// „databáze není připravena"); prohozené období se srovná.
export function readAttendanceFilters(
  get: (key: string) => string,
): AttendanceFilters {
  let from = dateValue(get("from"));
  let to = dateValue(get("to"));
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  const employeeId = get("employeeId").trim();
  return { from, to, employeeId: ID_RE.test(employeeId) ? employeeId : "" };
}

export function hasAttendanceFilters(filters: AttendanceFilters): boolean {
  return Boolean(filters.from || filters.to || filters.employeeId);
}

// Prisma `where` z filtrů — skládá se s hrAttendanceVisibilityWhere přes
// andWhere, takže filtr zaměstnance nikdy nerozšíří viditelnost.
export function attendanceFilterWhere(
  filters: AttendanceFilters,
): Prisma.HrAttendanceRecordWhereInput {
  const where: Prisma.HrAttendanceRecordWhereInput = {};
  const from = parseDateBoundary(filters.from, false);
  const to = parseDateBoundary(filters.to, true);
  if (from || to) {
    where.workDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  if (filters.employeeId) {
    where.employeeId = filters.employeeId;
  }
  return where;
}

export function attendanceFilterQuery(filters: AttendanceFilters): string {
  return filterQuery({
    from: filters.from,
    to: filters.to,
    employeeId: filters.employeeId,
  });
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Kalendářní měsíc vůči `officeToday` (UTC-půlnoc kancelářského dne, viz
 * officeWorkDate): offset 0 = tento měsíc, −1 = minulý.
 */
export function monthPeriod(
  officeToday: Date,
  offset = 0,
): { from: string; to: string } {
  const year = officeToday.getUTCFullYear();
  const month = officeToday.getUTCMonth() + offset;
  return {
    from: isoDay(new Date(Date.UTC(year, month, 1))),
    to: isoDay(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** Týden (pondělí–neděle) obsahující `officeToday`. */
export function weekPeriod(officeToday: Date): { from: string; to: string } {
  const weekday = (officeToday.getUTCDay() + 6) % 7; // 0 = pondělí
  const monday = new Date(officeToday.getTime() - weekday * 86_400_000);
  return {
    from: isoDay(monday),
    to: isoDay(new Date(monday.getTime() + 6 * 86_400_000)),
  };
}

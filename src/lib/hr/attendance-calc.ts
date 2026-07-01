import { round2 } from "@/lib/hr/leave-balance";

// Pure attendance math (F7 / HR-4). No DB/clock.

// Worked hours from check-in/out minus breaks; never negative.
export function computeWorkedHours(
  checkIn: Date,
  checkOut: Date,
  breakHours: number,
): number {
  const grossHours = (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
  return Math.max(0, round2(grossHours - breakHours));
}

// Overtime = worked beyond the scheduled daily fund; never negative.
export function computeOvertimeHours(
  workedHours: number,
  scheduleDailyHours: number,
): number {
  return Math.max(0, round2(workedHours - scheduleDailyHours));
}

// The office's default time zone. Attendance workDate is a calendar day in this
// zone, stored as UTC-midnight — so a punch at 23:30 local lands on the local
// day the employee actually worked, not the UTC day.
export const OFFICE_TIME_ZONE = "Europe/Prague";

/**
 * The calendar day (as UTC-midnight) that `now` falls on IN the office time zone.
 * Pure: pass the clock in. Used for the daily attendance key so "today" matches
 * what the employee sees locally, even around the UTC midnight boundary.
 */
export function officeWorkDate(now: Date, timeZone = OFFICE_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

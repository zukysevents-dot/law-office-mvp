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

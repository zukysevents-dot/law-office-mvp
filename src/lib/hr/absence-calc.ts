import { round2 } from "@/lib/hr/leave-balance";

// Pure absence-hours math (F7 / HR-5). Counts WORKING days (Mon–Fri, UTC) in the
// inclusive [startDate, endDate] range and multiplies by the employee's daily
// hours. A half-day is only meaningful for a single day. Dates are UTC-midnight
// (date-only fields), so we read UTC parts to avoid timezone drift.

export function countWeekdays(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) {
    return 0;
  }
  let count = 0;
  const cursor = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
    ),
  );
  const last = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  while (cursor.getTime() <= last) {
    const day = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function computeAbsenceHours({
  startDate,
  endDate,
  halfDay,
  dailyHours,
}: {
  startDate: Date;
  endDate: Date;
  halfDay: boolean;
  dailyHours: number;
}): number {
  const days = countWeekdays(startDate, endDate);
  if (days === 0) {
    return 0;
  }
  // Half-day only applies to a single-day request.
  if (halfDay && days === 1) {
    return round2(dailyHours / 2);
  }
  return round2(days * dailyHours);
}

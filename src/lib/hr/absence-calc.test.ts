import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAbsenceHours, countWeekdays } from "./absence-calc";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("countWeekdays: inclusive range, excludes weekends (UTC)", () => {
  // Mon 2026-06-22 .. Fri 2026-06-26 = 5 weekdays.
  assert.equal(countWeekdays(d("2026-06-22"), d("2026-06-26")), 5);
  // Mon .. next Mon = 6 weekdays (incl. both Mondays, skip Sat/Sun).
  assert.equal(countWeekdays(d("2026-06-22"), d("2026-06-29")), 6);
  // A single weekday.
  assert.equal(countWeekdays(d("2026-06-22"), d("2026-06-22")), 1);
  // A weekend-only range → 0.
  assert.equal(countWeekdays(d("2026-06-27"), d("2026-06-28")), 0);
  // Reversed range → 0 (defensive).
  assert.equal(countWeekdays(d("2026-06-26"), d("2026-06-22")), 0);
});

test("computeAbsenceHours: weekdays * dailyHours", () => {
  assert.equal(
    computeAbsenceHours({
      startDate: d("2026-06-22"),
      endDate: d("2026-06-26"),
      halfDay: false,
      dailyHours: 8,
    }),
    40,
  );
});

test("computeAbsenceHours: half-day only applies to a single day", () => {
  assert.equal(
    computeAbsenceHours({
      startDate: d("2026-06-22"),
      endDate: d("2026-06-22"),
      halfDay: true,
      dailyHours: 8,
    }),
    4,
  );
  // Half-day flag is ignored for multi-day ranges.
  assert.equal(
    computeAbsenceHours({
      startDate: d("2026-06-22"),
      endDate: d("2026-06-23"),
      halfDay: true,
      dailyHours: 8,
    }),
    16,
  );
});

test("countWeekdays: spans a month boundary (cursor rolls over correctly)", () => {
  // Mon 2026-06-29 .. Fri 2026-07-03 = 5 weekdays across the June→July break.
  assert.equal(countWeekdays(d("2026-06-29"), d("2026-07-03")), 5);
  // Whole calendar month of July 2026 (Wed 1st .. Fri 31st) = 23 weekdays.
  assert.equal(countWeekdays(d("2026-07-01"), d("2026-07-31")), 23);
});

test("countWeekdays: spans a year boundary (Dec→Jan, no off-by-one)", () => {
  // Mon 2025-12-29 .. Fri 2026-01-02 = 5 weekdays (Wed 31st, Thu 1st incl.).
  assert.equal(countWeekdays(d("2025-12-29"), d("2026-01-02")), 5);
});

test("computeAbsenceHours: weekend-only range → 0", () => {
  assert.equal(
    computeAbsenceHours({
      startDate: d("2026-06-27"),
      endDate: d("2026-06-28"),
      halfDay: false,
      dailyHours: 8,
    }),
    0,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDeadline,
  isBusinessDay,
  isCzechHoliday,
} from "./deadlines";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

test("fixed Czech holidays are detected", () => {
  assert.equal(isCzechHoliday(utc(2026, 1, 1)), true); // Nový rok
  assert.equal(isCzechHoliday(utc(2026, 7, 5)), true); // Cyril a Metoděj
  assert.equal(isCzechHoliday(utc(2026, 12, 26)), true); // 2. sv. vánoční
  assert.equal(isCzechHoliday(utc(2026, 3, 3)), false); // ordinary Tuesday
});

test("movable Easter holidays are computed", () => {
  // Easter Sunday 2026 = 5 April → Good Friday 3 Apr, Easter Monday 6 Apr.
  assert.equal(isCzechHoliday(utc(2026, 4, 3)), true);
  assert.equal(isCzechHoliday(utc(2026, 4, 6)), true);
  assert.equal(isCzechHoliday(utc(2026, 4, 5)), false); // Sunday but not in list
});

test("isBusinessDay excludes weekends and holidays", () => {
  assert.equal(isBusinessDay(utc(2026, 3, 7)), false); // Saturday
  assert.equal(isBusinessDay(utc(2026, 3, 8)), false); // Sunday
  assert.equal(isBusinessDay(utc(2026, 3, 9)), true); // Monday
  assert.equal(isBusinessDay(utc(2026, 1, 1)), false); // holiday
});

test("CALENDAR_DAYS adds calendar days", () => {
  const d = computeDeadline(utc(2026, 3, 2), {
    offsetDays: 15,
    calendar: "CALENDAR_DAYS",
    rollForward: false,
  });
  assert.equal(d.getTime(), utc(2026, 3, 17).getTime());
});

test("CALENDAR_DAYS rolls a weekend deadline forward to Monday", () => {
  // 2026-03-06 (Fri) + 1 = Sat 07 → roll to Mon 09.
  const d = computeDeadline(utc(2026, 3, 6), {
    offsetDays: 1,
    calendar: "CALENDAR_DAYS",
    rollForward: true,
  });
  assert.equal(d.getTime(), utc(2026, 3, 9).getTime());
});

test("CALENDAR_DAYS rolls past a holiday", () => {
  // 2025-12-31 + 1 = 2026-01-01 (holiday) → 01-02 (Fri).
  const d = computeDeadline(utc(2025, 12, 31), {
    offsetDays: 1,
    calendar: "CALENDAR_DAYS",
    rollForward: true,
  });
  assert.equal(d.getTime(), utc(2026, 1, 2).getTime());
});

test("BUSINESS_DAYS skips weekends and holidays", () => {
  // 3 business days from Fri 2026-03-06: Mon 09, Tue 10, Wed 11.
  const d = computeDeadline(utc(2026, 3, 6), {
    offsetDays: 3,
    calendar: "BUSINESS_DAYS",
    rollForward: false,
  });
  assert.equal(d.getTime(), utc(2026, 3, 11).getTime());
});

test("zero offset returns the trigger day (calendar)", () => {
  const d = computeDeadline(utc(2026, 3, 2), {
    offsetDays: 0,
    calendar: "CALENDAR_DAYS",
    rollForward: false,
  });
  assert.equal(d.getTime(), utc(2026, 3, 2).getTime());
});

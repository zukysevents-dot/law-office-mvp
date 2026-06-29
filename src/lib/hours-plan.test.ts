import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAY_MS,
  fulfillmentPercent,
  weekStartUtcMs,
  weeklyHoursBuckets,
} from "./hours-plan";

test("fulfillmentPercent: null when target missing or non-positive", () => {
  assert.equal(fulfillmentPercent(10, null), null);
  assert.equal(fulfillmentPercent(10, undefined), null);
  assert.equal(fulfillmentPercent(10, 0), null);
  assert.equal(fulfillmentPercent(10, -5), null);
  assert.equal(fulfillmentPercent(10, Number.NaN), null);
});

test("fulfillmentPercent: rounds actual / target to whole percent", () => {
  assert.equal(fulfillmentPercent(20, 40), 50);
  assert.equal(fulfillmentPercent(40, 40), 100);
  assert.equal(fulfillmentPercent(50, 40), 125);
  assert.equal(fulfillmentPercent(13, 40), 33); // 32.5 → 33
});

test("weekStartUtcMs: returns Monday 00:00 UTC", () => {
  // 2026-06-29 is a Monday.
  const monday = weekStartUtcMs(new Date("2026-06-29T12:34:00.000Z"));
  assert.equal(new Date(monday).toISOString(), "2026-06-29T00:00:00.000Z");
  // Sunday belongs to the same (previous-Monday) week.
  const fromSunday = weekStartUtcMs(new Date("2026-07-05T23:00:00.000Z"));
  assert.equal(new Date(fromSunday).toISOString(), "2026-06-29T00:00:00.000Z");
});

test("weeklyHoursBuckets: buckets sums by day index, ignores out-of-week", () => {
  const weekStart = Date.UTC(2026, 5, 29); // Monday 2026-06-29
  const buckets = weeklyHoursBuckets(weekStart, [
    { workDate: new Date(weekStart), hours: 2 }, // Po
    { workDate: new Date(weekStart), hours: 1.5 }, // Po (sčítá se)
    { workDate: new Date(weekStart + 2 * DAY_MS), hours: 3 }, // St
    { workDate: new Date(weekStart + 6 * DAY_MS), hours: 4 }, // Ne
    { workDate: new Date(weekStart - DAY_MS), hours: 9 }, // minulý týden → mimo
    { workDate: new Date(weekStart + 7 * DAY_MS), hours: 9 }, // příští týden → mimo
  ]);

  assert.equal(buckets.length, 7);
  assert.deepEqual(
    buckets.map((bucket) => bucket.hours),
    [3.5, 0, 3, 0, 0, 0, 4],
  );
  assert.deepEqual(
    buckets.map((bucket) => bucket.label),
    ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
  );
});

test("weeklyHoursBuckets: clamps negative hours to 0 (defensive)", () => {
  const weekStart = Date.UTC(2026, 5, 29);
  const buckets = weeklyHoursBuckets(weekStart, [
    { workDate: new Date(weekStart), hours: -3 },
    { workDate: new Date(weekStart), hours: 2 },
  ]);

  assert.equal(buckets[0].hours, 2); // -3 ořezáno na 0, +2
  assert.ok(buckets.every((bucket) => bucket.hours >= 0));
});

test("weeklyHoursBuckets: all-zero week does not produce NaN heights", () => {
  const weekStart = Date.UTC(2026, 5, 29);
  const buckets = weeklyHoursBuckets(weekStart, []);
  const total = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);

  assert.equal(total, 0);
  assert.ok(buckets.every((bucket) => Number.isFinite(bucket.hours)));
});

// Dashboard (graf) i /work-logs (karta „Tento týden") počítají začátek týdne
// přes tentýž weekStartUtcMs — tím je interval deterministicky shodný a
// nezávislý na časové zóně běhu (regrese proti UTC/lokální nekonzistenci).
test("weekStartUtcMs: deterministic across late-night boundary", () => {
  // Neděle 23:30 UTC stále patří do týdne začínajícího předchozím pondělím.
  const lateSunday = weekStartUtcMs(new Date("2026-07-05T23:30:00.000Z"));
  const earlyMonday = weekStartUtcMs(new Date("2026-06-29T00:30:00.000Z"));
  assert.equal(lateSunday, earlyMonday);
  assert.equal(new Date(lateSunday).toISOString(), "2026-06-29T00:00:00.000Z");
});

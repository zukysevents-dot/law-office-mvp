import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAY_MS,
  EMPTY_HOURS_PLAN,
  dailyKpiBuckets,
  fulfillmentPercent,
  hoursPlanFromRecord,
  isBillableKpiHours,
  officeWeekStartUtcMs,
  periodTargets,
  sanitizeHoursTarget,
  sumKpiBuckets,
  validateHoursPlan,
  weekStartUtcMs,
  weeklyHoursBuckets,
  weeklyKpiBuckets,
  workingDaysBetween,
  type HoursPlanTargets,
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

// --- KPI fakturovatelných hodin (balík 08) ----------------------------------

const BILLING = [
  "BILLABLE",
  "NEEDS_APPROVAL",
  "INTERNAL_NON_BILLABLE",
  "HIDDEN_WRITE_OFF",
  "VISIBLE_WRITE_OFF",
] as const;
const APPROVAL = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ADJUSTED"] as const;

test("isBillableKpiHours: full BillingStatus × ApprovalStatus matrix", () => {
  for (const billing of BILLING) {
    for (const approval of APPROVAL) {
      const expected =
        (billing === "BILLABLE" || billing === "NEEDS_APPROVAL") &&
        approval !== "REJECTED";
      assert.equal(
        isBillableKpiHours(billing, approval),
        expected,
        `${billing}/${approval}`,
      );
    }
  }
});

test("sanitizeHoursTarget: 0, negative, NaN, null → null; rounds to 2 dp", () => {
  assert.equal(sanitizeHoursTarget(0), null);
  assert.equal(sanitizeHoursTarget(-3), null);
  assert.equal(sanitizeHoursTarget(Number.NaN), null);
  assert.equal(sanitizeHoursTarget(null), null);
  assert.equal(sanitizeHoursTarget(Number.POSITIVE_INFINITY), null);
  assert.equal(sanitizeHoursTarget(37.5), 37.5);
  assert.equal(sanitizeHoursTarget(10.005), 10.01);
});

function plan(partial: Partial<HoursPlanTargets>): HoursPlanTargets {
  return { ...EMPTY_HOURS_PLAN, ...partial };
}

test("validateHoursPlan: billable above total → error (weekly and monthly)", () => {
  const message = "Cíl fakturovatelných hodin nemůže být vyšší než cíl hodin celkem.";
  assert.equal(validateHoursPlan(plan({ weeklyTotal: 20, weeklyBillable: 25 })), message);
  assert.equal(validateHoursPlan(plan({ monthlyTotal: 100, monthlyBillable: 120 })), message);
  assert.equal(validateHoursPlan(plan({ weeklyTotal: 40, weeklyBillable: 40 })), null);
});

test("validateHoursPlan: billable without total is fine; empty plan is fine", () => {
  assert.equal(validateHoursPlan(plan({ weeklyBillable: 30 })), null);
  assert.equal(validateHoursPlan(plan({ monthlyBillable: 30 })), null);
  assert.equal(validateHoursPlan(EMPTY_HOURS_PLAN), null);
});

test("validateHoursPlan: 168 h / 744 h limits", () => {
  assert.equal(validateHoursPlan(plan({ weeklyTotal: 168 })), null);
  assert.equal(
    validateHoursPlan(plan({ weeklyTotal: 168.5 })),
    "Týdenní cíl může být nejvýše 168 h.",
  );
  assert.equal(
    validateHoursPlan(plan({ weeklyBillable: 200 })),
    "Týdenní cíl může být nejvýše 168 h.",
  );
  assert.equal(validateHoursPlan(plan({ monthlyTotal: 744 })), null);
  assert.equal(
    validateHoursPlan(plan({ monthlyTotal: 745 })),
    "Měsíční cíl může být nejvýše 744 h.",
  );
});

test("hoursPlanFromRecord: Decimal-like values → numbers, null record → empty", () => {
  assert.deepEqual(hoursPlanFromRecord(null), EMPTY_HOURS_PLAN);
  assert.deepEqual(
    hoursPlanFromRecord({
      weeklyHoursTarget: { toString: () => "40" },
      monthlyHoursTarget: null,
      weeklyBillableHoursTarget: "30.5",
      monthlyBillableHoursTarget: { toString: () => "0" },
    }),
    { weeklyTotal: 40, weeklyBillable: 30.5, monthlyTotal: null, monthlyBillable: null },
  );
});

test("workingDaysBetween: Mon–Fri only", () => {
  assert.equal(workingDaysBetween(Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 1)), 22);
  assert.equal(workingDaysBetween(Date.UTC(2026, 9, 26), Date.UTC(2026, 10, 2)), 5);
  assert.equal(workingDaysBetween(Date.UTC(2026, 9, 31), Date.UTC(2026, 10, 2)), 0);
});

const FULL = plan({ weeklyTotal: 40, weeklyBillable: 30, monthlyTotal: 140, monthlyBillable: 100 });

test("periodTargets: full week with weekly target → weekly target", () => {
  const from = Date.UTC(2026, 9, 26); // Po 26. 10. 2026
  assert.deepEqual(periodTargets(FULL, from, from + 7 * DAY_MS), { total: 40, billable: 30 });
});

test("periodTargets: full month (October 2026) → monthly target", () => {
  assert.deepEqual(periodTargets(FULL, Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 1)), {
    total: 140,
    billable: 100,
  });
});

test("periodTargets: quarter = 3 × monthly", () => {
  assert.deepEqual(periodTargets(FULL, Date.UTC(2026, 9, 1), Date.UTC(2027, 0, 1)), {
    total: 420,
    billable: 300,
  });
});

test("periodTargets: custom 1.–9. 10. 2026 = 7 of 22 working days of monthly", () => {
  const targets = periodTargets(FULL, Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 10));
  assert.equal(targets.total, 44.55); // 140 × 7 / 22
  assert.equal(targets.billable, 31.82); // 100 × 7 / 22
});

test("periodTargets: only weekly target and a month → weekly / 5 × working days", () => {
  const targets = periodTargets(
    plan({ weeklyTotal: 40 }),
    Date.UTC(2026, 9, 1),
    Date.UTC(2026, 10, 1),
  );
  assert.deepEqual(targets, { total: 176, billable: null });
});

test("periodTargets: nothing set → null; billable computed independently", () => {
  assert.deepEqual(
    periodTargets(EMPTY_HOURS_PLAN, Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 1)),
    { total: null, billable: null },
  );
  const onlyBillable = periodTargets(
    plan({ monthlyBillable: 110 }),
    Date.UTC(2026, 9, 1),
    Date.UTC(2026, 10, 1),
  );
  assert.deepEqual(onlyBillable, { total: null, billable: 110 });
});

test("periodTargets: single weekday prefers weekly / 5, weekend day is 0", () => {
  const monday = Date.UTC(2026, 9, 26);
  assert.deepEqual(periodTargets(FULL, monday, monday + DAY_MS), { total: 8, billable: 6 });
  const saturday = Date.UTC(2026, 9, 31);
  assert.deepEqual(periodTargets(FULL, saturday, saturday + DAY_MS), { total: 0, billable: 0 });
});

test("officeWeekStartUtcMs: Monday 0:30 Prague is already the new week", () => {
  // 2026-11-01T23:30Z = pondělí 2. 11. 0:30 Praha (SEČ, UTC+1)
  assert.equal(
    new Date(officeWeekStartUtcMs(new Date("2026-11-01T23:30:00.000Z"))).toISOString(),
    "2026-11-02T00:00:00.000Z",
  );
  // 2026-07-05T21:30Z = neděle 5. 7. 23:30 Praha (SELČ) → týden od 29. 6.
  assert.equal(
    new Date(officeWeekStartUtcMs(new Date("2026-07-05T21:30:00.000Z"))).toISOString(),
    "2026-06-29T00:00:00.000Z",
  );
});

test("dailyKpiBuckets: splits billable/non-billable, ignores out-of-week, Mon–Fri targets", () => {
  const weekStart = Date.UTC(2026, 9, 26);
  const buckets = dailyKpiBuckets(
    weekStart,
    weekStart + 7 * DAY_MS,
    [
      { workDate: new Date(weekStart), hours: 3, billable: true },
      { workDate: new Date(weekStart), hours: 1, billable: false },
      { workDate: new Date(weekStart + 2 * DAY_MS), hours: 2.5, billable: true },
      { workDate: new Date(weekStart + 5 * DAY_MS), hours: -4, billable: true },
      { workDate: new Date(weekStart - DAY_MS), hours: 9, billable: true },
      { workDate: new Date(weekStart + 7 * DAY_MS), hours: 9, billable: false },
    ],
    FULL,
    { todayMs: weekStart + DAY_MS },
  );

  assert.equal(buckets.length, 7);
  assert.deepEqual(buckets.map((b) => b.total), [4, 0, 2.5, 0, 0, 0, 0]);
  assert.deepEqual(buckets.map((b) => b.billable), [3, 0, 2.5, 0, 0, 0, 0]);
  assert.deepEqual(buckets.map((b) => b.totalTarget), [8, 8, 8, 8, 8, 0, 0]);
  assert.deepEqual(buckets.map((b) => b.billableTarget), [6, 6, 6, 6, 6, 0, 0]);
  assert.equal(buckets[0].label, "Po 26. 10.");
  assert.equal(buckets[6].label, "Ne 1. 11.");
  assert.deepEqual(buckets.map((b) => b.current), [false, true, false, false, false, false, false]);
  assert.deepEqual(sumKpiBuckets(buckets), { total: 6.5, billable: 5.5 });
});

test("weeklyKpiBuckets: October 2026 = 5 buckets cut to the month, monthly targets", () => {
  const from = Date.UTC(2026, 9, 1);
  const to = Date.UTC(2026, 10, 1);
  const buckets = weeklyKpiBuckets(
    from,
    to,
    [
      { workDate: new Date(Date.UTC(2026, 9, 2)), hours: 5, billable: true },
      { workDate: new Date(Date.UTC(2026, 9, 6)), hours: 2, billable: false },
      { workDate: new Date(Date.UTC(2026, 9, 31)), hours: 1, billable: true },
      { workDate: new Date(Date.UTC(2026, 10, 2)), hours: 9, billable: true },
    ],
    plan({ weeklyTotal: 40, monthlyTotal: 132 }),
  );

  assert.deepEqual(
    buckets.map((b) => b.label),
    ["1.–4. 10.", "5.–11. 10.", "12.–18. 10.", "19.–25. 10.", "26.–31. 10."],
  );
  assert.deepEqual(buckets.map((b) => b.total), [5, 2, 0, 0, 1]);
  assert.deepEqual(buckets.map((b) => b.billable), [5, 0, 0, 0, 1]);
  // 132 h / 22 prac. dnů = 6 h na den; 2 + 5 + 5 + 5 + 5 dnů.
  assert.deepEqual(buckets.map((b) => b.totalTarget), [12, 30, 30, 30, 30]);
  assert.deepEqual(buckets.map((b) => b.billableTarget), [null, null, null, null, null]);
  const sum = buckets.reduce((acc, b) => acc + (b.totalTarget ?? 0), 0);
  assert.equal(sum, 132);
});

test("weeklyKpiBuckets: November 2026 starts on Sunday → first bucket is 1 day, target 0", () => {
  const buckets = weeklyKpiBuckets(
    Date.UTC(2026, 10, 1),
    Date.UTC(2026, 11, 1),
    [],
    plan({ monthlyTotal: 105 }),
  );
  assert.equal(buckets[0].label, "1. 11.");
  assert.equal(buckets[0].totalTarget, 0);
  assert.equal(buckets[1].label, "2.–8. 11.");
  assert.equal(buckets.length, 6);
  assert.equal(buckets.at(-1)?.label, "30. 11.");
});

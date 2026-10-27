import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_HOURS_PLAN } from "@/lib/hours-plan";

import {
  absenceDaysInRange,
  buildPerformanceRows,
  classifyHours,
  filterPerformanceRows,
  mergeCounts,
  performanceTotals,
  sortPerformanceRows,
  workloadLevel,
  type PerformanceMember,
  type PerformanceRowsInput,
} from "./metrics";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

test("classifyHours: KPI billable incl. pending, rejected/write-offs non-billable", () => {
  const split = classifyHours([
    { billingStatus: "BILLABLE", approvalStatus: "DRAFT", hours: 5 },
    { billingStatus: "BILLABLE", approvalStatus: "APPROVED", hours: 2 },
    { billingStatus: "NEEDS_APPROVAL", approvalStatus: "SUBMITTED", hours: 1 },
    { billingStatus: "BILLABLE", approvalStatus: "REJECTED", hours: 1.5 },
    { billingStatus: "INTERNAL_NON_BILLABLE", approvalStatus: "DRAFT", hours: 2 },
    { billingStatus: "HIDDEN_WRITE_OFF", approvalStatus: "APPROVED", hours: 0.5 },
    { billingStatus: "VISIBLE_WRITE_OFF", approvalStatus: "APPROVED", hours: 0.25 },
  ]);
  assert.deepEqual(split, { total: 12.25, billable: 8, approvedBillable: 2, nonBillable: 4.25 });
});

test("mergeCounts: sums groupBy results, skips null keys", () => {
  const merged = mergeCounts(
    [
      { key: "a", count: 2 },
      { key: null, count: 9 },
    ],
    new Map([
      ["a", 1],
      ["b", 3],
    ]),
  );
  assert.deepEqual([...merged.entries()].sort(), [
    ["a", 3],
    ["b", 3],
  ]);
});

test("absenceDaysInRange: overlap, weekend, half-day, HOME_OFFICE skipped, by type", () => {
  const from = Date.UTC(2025, 2, 3); // po 3. 3. 2025
  const to = Date.UTC(2025, 2, 10);
  const summary = absenceDaysInRange(
    [
      { type: "SICK", startDate: d("2025-03-06"), endDate: d("2025-03-07"), halfDay: false }, // čt–pá = 2
      { type: "VACATION", startDate: d("2025-02-27"), endDate: d("2025-03-03"), halfDay: false }, // přesah → po = 1
      { type: "DOCTOR", startDate: d("2025-03-05"), endDate: d("2025-03-05"), halfDay: true }, // 0,5
      { type: "HOME_OFFICE", startDate: d("2025-03-04"), endDate: d("2025-03-04"), halfDay: false },
      { type: "VACATION", startDate: d("2025-03-08"), endDate: d("2025-03-09"), halfDay: false }, // víkend = 0
      { type: "SICK", startDate: d("2025-03-10"), endDate: d("2025-03-12"), halfDay: false }, // mimo
    ],
    from,
    to,
  );
  assert.equal(summary.days, 3.5);
  assert.deepEqual(summary.byType, { SICK: 2, VACATION: 1, DOCTOR: 0.5 });
});

test("workloadLevel: thresholds 8 and 16", () => {
  assert.equal(workloadLevel(7), "LOW");
  assert.equal(workloadLevel(8), "MEDIUM");
  assert.equal(workloadLevel(15), "MEDIUM");
  assert.equal(workloadLevel(16), "HIGH");
});

const MEMBERS: PerformanceMember[] = [
  { userId: "u1", name: "Advokát Demo", role: "LAWYER", teamId: "t1", teamName: "Sporná" },
  { userId: "u2", name: "Cyril", role: "TRAINEE", teamId: "t1", teamName: "Sporná" },
  { userId: "u3", name: "Čech", role: "PARTNER", teamId: null, teamName: null },
  { userId: "u4", name: "David", role: "ADMIN", teamId: null, teamName: null },
];

function input(overrides: Partial<PerformanceRowsInput> = {}): PerformanceRowsInput {
  return {
    members: MEMBERS,
    plans: new Map([
      [
        "u1",
        { ...EMPTY_HOURS_PLAN, weeklyTotal: 40, weeklyBillable: 30, monthlyTotal: 160 },
      ],
    ]),
    hours: new Map([
      [
        "u1",
        [
          { billingStatus: "BILLABLE", approvalStatus: "DRAFT", hours: 5 },
          { billingStatus: "INTERNAL_NON_BILLABLE", approvalStatus: "DRAFT", hours: 2 },
        ],
      ],
      ["u2", [{ billingStatus: "BILLABLE", approvalStatus: "APPROVED", hours: 1 }]],
    ]),
    openTasks: new Map([
      ["u1", 6],
      ["u2", 1],
    ]),
    overdueTasks: new Map([["u1", 2]]),
    completedTasks: new Map([["u2", 4]]),
    upcomingTasks: new Map([["u1", 1]]),
    upcomingDeadlines: new Map([["u1", 1]]),
    hr: null,
    fromMs: Date.UTC(2025, 2, 3),
    toExclusiveMs: Date.UTC(2025, 2, 10),
    ...overrides,
  };
}

test("buildPerformanceRows: targets via periodTargets, % and workload", () => {
  const rows = buildPerformanceRows(input());
  const lawyer = rows[0];
  assert.equal(lawyer.hours.total, 7);
  assert.equal(lawyer.totalTarget, 40); // celý týden → týdenní cíl
  assert.equal(lawyer.totalPct, 18);
  assert.equal(lawyer.billableTarget, 30);
  assert.equal(lawyer.billablePct, 17);
  assert.equal(lawyer.upcomingTotal, 2);
  assert.equal(lawyer.workloadScore, 10); // 6 + 2 + 2
  assert.equal(lawyer.workload, "MEDIUM");
  assert.equal(lawyer.hr, null);
  const trainee = rows[1];
  assert.equal(trainee.totalTarget, null);
  assert.equal(trainee.totalPct, null);
  assert.equal(trainee.completedTasks, 4);
});

test("buildPerformanceRows: HR data per employee, missing card flagged", () => {
  const rows = buildPerformanceRows(
    input({
      hr: {
        employeeByUser: new Map([["u2", "e2"]]),
        attendance: new Map([["e2", { days: 1, hours: 8 }]]),
        absences: new Map([
          [
            "e2",
            [{ type: "SICK", startDate: d("2025-03-06"), endDate: d("2025-03-07"), halfDay: false }],
          ],
        ]),
      },
    }),
  );
  assert.equal(rows[0].hr?.hasEmployee, false);
  assert.deepEqual(rows[1].hr, {
    hasEmployee: true,
    workedDays: 1,
    workedHours: 8,
    absence: { days: 2, byType: { SICK: 2 } },
  });
});

test("filterPerformanceRows: team, no team, role, person", () => {
  const names = (rows: PerformanceMember[]) => rows.map((row) => row.name);
  assert.deepEqual(names(filterPerformanceRows(MEMBERS, { teamId: "t1" })), ["Advokát Demo", "Cyril"]);
  assert.deepEqual(names(filterPerformanceRows(MEMBERS, { teamId: "none" })), ["Čech", "David"]);
  assert.deepEqual(names(filterPerformanceRows(MEMBERS, { role: "TRAINEE" })), ["Cyril"]);
  assert.deepEqual(names(filterPerformanceRows(MEMBERS, { userId: "u4" })), ["David"]);
  assert.equal(filterPerformanceRows(MEMBERS, {}).length, 4);
});

test("sortPerformanceRows: Czech names, numbers both ways, nulls last", () => {
  const rows = buildPerformanceRows(input());
  const names = (list: typeof rows) => list.map((row) => row.name);
  assert.deepEqual(names(sortPerformanceRows(rows, "name", "asc")), [
    "Advokát Demo",
    "Cyril",
    "Čech",
    "David",
  ]);
  assert.deepEqual(names(sortPerformanceRows(rows, "total", "desc")).slice(0, 2), [
    "Advokát Demo",
    "Cyril",
  ]);
  assert.equal(sortPerformanceRows(rows, "total", "asc").at(-1)?.name, "Advokát Demo");

  const withHr = buildPerformanceRows(
    input({
      hr: {
        employeeByUser: new Map([
          ["u2", "e2"],
          ["u4", "e4"],
        ]),
        attendance: new Map([
          ["e2", { days: 1, hours: 8 }],
          ["e4", { days: 2, hours: 16 }],
        ]),
        absences: new Map(),
      },
    }),
  );
  // Bez karty zaměstnance (null) je vždy na konci, v obou směrech.
  assert.deepEqual(names(sortPerformanceRows(withHr, "attendance", "desc")), [
    "David",
    "Cyril",
    "Advokát Demo",
    "Čech",
  ]);
  assert.deepEqual(names(sortPerformanceRows(withHr, "attendance", "asc")), [
    "Cyril",
    "David",
    "Advokát Demo",
    "Čech",
  ]);
});

test("performanceTotals: sums, % only over people with a plan", () => {
  const totals = performanceTotals(buildPerformanceRows(input()));
  assert.equal(totals.hours.total, 8);
  assert.equal(totals.hours.billable, 6);
  assert.equal(totals.totalTarget, 40);
  assert.equal(totals.totalWithTarget, 7);
  assert.equal(totals.totalPct, 18);
  assert.equal(totals.peopleWithTotalTarget, 1);
  assert.equal(totals.people, 4);
  assert.equal(totals.openTasks, 7);
  assert.equal(totals.overdueTasks, 2);
  assert.equal(totals.completedTasks, 4);
  assert.equal(totals.hr, null);
  assert.equal(performanceTotals([]).totalPct, null);
});

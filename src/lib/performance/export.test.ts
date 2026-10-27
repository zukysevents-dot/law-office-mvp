import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_HOURS_PLAN } from "@/lib/hours-plan";

import {
  performanceExportFilename,
  performanceXlsxColumns,
  performanceXlsxRows,
} from "./export";
import { buildPerformanceRows } from "./metrics";

const rows = buildPerformanceRows({
  members: [
    { userId: "u1", name: "Advokát Demo", role: "LAWYER", teamId: null, teamName: null },
    { userId: "u2", name: "Koncipient Demo", role: "TRAINEE", teamId: "t", teamName: "Tým" },
  ],
  plans: new Map([["u1", { ...EMPTY_HOURS_PLAN, weeklyTotal: 40, weeklyBillable: 30 }]]),
  hours: new Map([["u1", [{ billingStatus: "BILLABLE", approvalStatus: "DRAFT", hours: 5 }]]]),
  openTasks: new Map(),
  overdueTasks: new Map(),
  completedTasks: new Map(),
  upcomingTasks: new Map(),
  upcomingDeadlines: new Map(),
  hr: {
    employeeByUser: new Map([["u2", "e2"]]),
    attendance: new Map([["e2", { days: 1, hours: 8 }]]),
    absences: new Map(),
  },
  fromMs: Date.UTC(2025, 2, 3),
  toExclusiveMs: Date.UTC(2025, 2, 10),
});

test("without HR there are no HR columns", () => {
  const headers = performanceXlsxColumns({ showHr: false }).map((column) => column.header);
  assert.equal(headers.includes("Odpracované dny"), false);
  assert.equal(headers.includes("Cíl fakturovatelných"), true);
  const withHr = performanceXlsxColumns({ showHr: true }).map((column) => column.header);
  assert.deepEqual(withHr.slice(-3), ["Odpracované dny", "Odpracované hodiny", "Absence (dny)"]);
  assert.equal("workedDays" in performanceXlsxRows(rows, { showHr: false })[0], false);
});

test("numbers stay numbers, missing values are empty cells", () => {
  const [lawyer, trainee] = performanceXlsxRows(rows, { showHr: true });
  assert.equal(lawyer.total, 5);
  assert.equal(typeof lawyer.total, "number");
  assert.equal(lawyer.totalTarget, 40);
  assert.equal(lawyer.totalPct, 13);
  assert.equal(lawyer.role, "Advokát");
  assert.equal(lawyer.workedDays, null); // bez karty zaměstnance
  assert.equal(trainee.totalTarget, null);
  assert.equal(trainee.totalPct, null);
  assert.equal(trainee.workedHours, 8);
  assert.equal(trainee.team, "Tým");
  assert.equal(trainee.workload, "Nízké");
});

test("filename is ASCII with the period", () => {
  assert.equal(
    performanceExportFilename("2025-03-03", "2025-03-09"),
    "vykonnost-2025-03-03_2025-03-09.xlsx",
  );
});

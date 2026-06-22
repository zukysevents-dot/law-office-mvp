import assert from "node:assert/strict";
import { test } from "node:test";

import { BillingStatus } from "@/generated/prisma/enums";

import {
  billabilityKpi,
  byLegalArea,
  byMonth,
  bySubject,
  type ReportWorkLog,
} from "./aggregations";

// Minimal row factory — only the fields the aggregations read.
function row(o: Partial<Record<string, unknown>>): ReportWorkLog {
  return {
    hours: 0,
    amountCzk: 0,
    billingStatus: BillingStatus.BILLABLE,
    workDate: new Date("2026-01-15T00:00:00.000Z"),
    userId: "u1",
    user: { name: "User One" },
    subjectId: "s1",
    subject: { name: "Subject One" },
    legalArea: null,
    ...o,
  } as unknown as ReportWorkLog;
}

test("billabilityKpi: empty rows → ratio 0 (no divide-by-zero NaN)", () => {
  const kpi = billabilityKpi([]);
  assert.equal(kpi.ratio, 0);
  assert.equal(kpi.totalHours, 0);
  assert.equal(kpi.totalCount, 0);
});

test("billabilityKpi: buckets by billing status and computes ratio", () => {
  const kpi = billabilityKpi([
    row({ billingStatus: BillingStatus.BILLABLE, hours: 3, amountCzk: 150 }),
    row({ billingStatus: BillingStatus.INTERNAL_NON_BILLABLE, hours: 1 }),
    row({ billingStatus: BillingStatus.NEEDS_APPROVAL, hours: 2 }),
  ]);
  assert.equal(kpi.billableHours, 3);
  assert.equal(kpi.nonBillableHours, 1);
  assert.equal(kpi.needsApprovalHours, 2);
  assert.equal(kpi.totalHours, 6);
  assert.equal(kpi.billableAmount, 150);
  assert.equal(kpi.billableCount, 1);
  assert.equal(kpi.totalCount, 3);
  assert.equal(kpi.ratio, 0.5); // 3 billable / 6 total
});

test("byMonth: groups by UTC YYYY-MM, sorted ascending", () => {
  const rows = byMonth([
    row({ workDate: new Date("2026-01-10T00:00:00.000Z"), hours: 2 }),
    row({ workDate: new Date("2026-01-20T00:00:00.000Z"), hours: 3 }),
    row({ workDate: new Date("2026-02-01T00:00:00.000Z"), hours: 1 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.key, r.hours, r.count]),
    [["2026-01", 5, 2], ["2026-02", 1, 1]],
  );
});

test("bySubject: groups by subjectId, sorted by hours desc", () => {
  const rows = bySubject([
    row({ subjectId: "s1", subject: { name: "A" }, hours: 1 }),
    row({ subjectId: "s2", subject: { name: "B" }, hours: 5 }),
    row({ subjectId: "s1", subject: { name: "A" }, hours: 1 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.label, r.hours]),
    [["B", 5], ["A", 2]],
  );
});

test("byLegalArea: null/blank area falls back to a labelled bucket", () => {
  const rows = byLegalArea([
    row({ legalArea: "Civilní", hours: 2 }),
    row({ legalArea: null, hours: 1 }),
  ]);
  const labels = rows.map((r) => r.label);
  assert.ok(labels.includes("Civilní"));
  assert.ok(labels.includes("Bez právní oblasti"));
});

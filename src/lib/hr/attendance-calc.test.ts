import assert from "node:assert/strict";
import { test } from "node:test";

import { computeOvertimeHours, computeWorkedHours } from "./attendance-calc";

const t = (iso: string) => new Date(iso);

test("computeWorkedHours: out - in - break, never negative", () => {
  assert.equal(
    computeWorkedHours(t("2026-06-22T08:00:00Z"), t("2026-06-22T16:30:00Z"), 0.5),
    8,
  );
  assert.equal(
    computeWorkedHours(t("2026-06-22T09:00:00Z"), t("2026-06-22T17:00:00Z"), 1),
    7,
  );
  // Break longer than the shift → clamped to 0, not negative.
  assert.equal(
    computeWorkedHours(t("2026-06-22T09:00:00Z"), t("2026-06-22T10:00:00Z"), 2),
    0,
  );
});

test("computeOvertimeHours: hours beyond the daily fund, never negative", () => {
  assert.equal(computeOvertimeHours(9.5, 8), 1.5);
  assert.equal(computeOvertimeHours(7, 8), 0); // under fund → no overtime
  assert.equal(computeOvertimeHours(8, 8), 0);
});

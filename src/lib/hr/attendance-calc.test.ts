import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeOvertimeHours,
  computeWorkedHours,
  officeWorkDate,
} from "./attendance-calc";

const t = (iso: string) => new Date(iso);

// --- officeWorkDate (pražská TZ, hranice půlnoci) ---------------------------

test("officeWorkDate: CET (zima) — 23:30 UTC = 00:30 lokálně → další den", () => {
  // 2026-01-15 23:30 UTC, CET (+1) → lokálně 2026-01-16 00:30 → den 16.
  assert.equal(
    officeWorkDate(t("2026-01-15T23:30:00Z")).toISOString(),
    "2026-01-16T00:00:00.000Z",
  );
});

test("officeWorkDate: CEST (léto) — 22:30 UTC = 00:30 lokálně → další den", () => {
  // 2026-06-15 22:30 UTC, CEST (+2) → lokálně 2026-06-16 00:30 → den 16.
  assert.equal(
    officeWorkDate(t("2026-06-15T22:30:00Z")).toISOString(),
    "2026-06-16T00:00:00.000Z",
  );
});

test("officeWorkDate: CEST — 21:30 UTC = 23:30 lokálně → týž den", () => {
  assert.equal(
    officeWorkDate(t("2026-06-15T21:30:00Z")).toISOString(),
    "2026-06-15T00:00:00.000Z",
  );
});

test("officeWorkDate: poledne UTC → týž kalendářní den", () => {
  assert.equal(
    officeWorkDate(t("2026-03-10T12:00:00Z")).toISOString(),
    "2026-03-10T00:00:00.000Z",
  );
});

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

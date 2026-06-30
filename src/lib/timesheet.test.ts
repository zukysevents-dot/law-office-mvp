import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeTimesheetTotals,
  parseBoolean,
  parseTimesheetScope,
  resolveShowAmounts,
} from "./timesheet";

// --- resolveShowAmounts (fail-closed gating sazeb) ---------------------------

test("resolveShowAmounts: junior (canViewRates=false) nikdy nevidí ceny, ani s amounts=1", () => {
  assert.equal(resolveShowAmounts(false, true), false);
  assert.equal(resolveShowAmounts(false, false), false);
});

test("resolveShowAmounts: oprávněný uživatel může ceny skrýt i zobrazit", () => {
  assert.equal(resolveShowAmounts(true, true), true);
  assert.equal(resolveShowAmounts(true, false), false);
});

// --- parseTimesheetScope -----------------------------------------------------

test("parseTimesheetScope: 'all' → all, cokoli jiného → billable (default)", () => {
  assert.equal(parseTimesheetScope("all"), "all");
  assert.equal(parseTimesheetScope("billable"), "billable");
  assert.equal(parseTimesheetScope(null), "billable");
  assert.equal(parseTimesheetScope(undefined), "billable");
  assert.equal(parseTimesheetScope("nonsense"), "billable");
});

// --- parseBoolean ------------------------------------------------------------

test("parseBoolean: 1/true/on → true", () => {
  assert.equal(parseBoolean("1"), true);
  assert.equal(parseBoolean("true"), true);
  assert.equal(parseBoolean("on"), true);
});

test("parseBoolean: prázdné/null → fallback", () => {
  assert.equal(parseBoolean(null), false);
  assert.equal(parseBoolean("", true), true);
  assert.equal(parseBoolean(undefined, true), true);
});

test("parseBoolean: 0/cokoli jiného → false", () => {
  assert.equal(parseBoolean("0"), false);
  assert.equal(parseBoolean("ne"), false);
});

// --- computeTimesheetTotals --------------------------------------------------

test("computeTimesheetTotals: prázdný seznam → nuly", () => {
  assert.deepEqual(computeTimesheetTotals([]), {
    count: 0,
    totalHours: 0,
    totalAmountCzk: 0,
  });
});

test("computeTimesheetTotals: sečte hodiny i částky", () => {
  const totals = computeTimesheetTotals([
    { hours: 1.5, amountCzk: 3000 },
    { hours: 2, amountCzk: 4000 },
  ]);
  assert.equal(totals.count, 2);
  assert.equal(totals.totalHours, 3.5);
  assert.equal(totals.totalAmountCzk, 7000);
});

test("computeTimesheetTotals: null hodnoty se počítají jako 0", () => {
  const totals = computeTimesheetTotals([
    { hours: null, amountCzk: null },
    { hours: 1, amountCzk: 1000 },
  ]);
  assert.equal(totals.totalHours, 1);
  assert.equal(totals.totalAmountCzk, 1000);
});

test("computeTimesheetTotals: string/Decimal-like vstup (toString) projde", () => {
  const totals = computeTimesheetTotals([
    { hours: "0.25", amountCzk: "500" },
    { hours: { toString: () => "0.75" }, amountCzk: { toString: () => "1500" } },
  ]);
  assert.equal(totals.totalHours, 1);
  assert.equal(totals.totalAmountCzk, 2000);
});

test("computeTimesheetTotals: zaokrouhlí akumulovanou částku na 2 desetinná místa", () => {
  const totals = computeTimesheetTotals([
    { hours: 0.1, amountCzk: 0.1 },
    { hours: 0.2, amountCzk: 0.2 },
  ]);
  assert.equal(totals.totalAmountCzk, 0.3);
});

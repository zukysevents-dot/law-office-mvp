import assert from "node:assert/strict";
import { test } from "node:test";

import {
  invalidPeriodMessage,
  type InvalidPeriodReason,
  parseIsoDate,
  resolvePerformancePeriod,
} from "./period";

const TODAY = new Date(Date.UTC(2026, 9, 27)); // út 27. 10. 2026
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

test("default is the current month", () => {
  const period = resolvePerformancePeriod({}, TODAY);
  assert.equal(period.kind, "month");
  assert.equal(iso(period.fromMs), "2026-10-01");
  assert.equal(iso(period.toExclusiveMs), "2026-11-01");
  assert.equal(period.toIso, "2026-10-31");
  assert.equal(period.label, "Říjen 2026 (1. 10. – 31. 10. 2026)");
  assert.deepEqual(period.params, { period: "month" });
  assert.equal(period.containsToday, true);
  assert.equal(period.error, undefined);
});

test("week 2026-10-27 → Mon 26. 10. – Sun 1. 11.", () => {
  const period = resolvePerformancePeriod({ period: "week" }, TODAY);
  assert.equal(iso(period.fromMs), "2026-10-26");
  assert.equal(iso(period.toExclusiveMs), "2026-11-02");
  assert.equal(period.label, "Týden 26. 10. – 1. 11. 2026");
});

test("quarter Q4 = 1. 10. – 1. 1. (exclusive)", () => {
  const period = resolvePerformancePeriod({ period: "quarter" }, TODAY);
  assert.equal(iso(period.fromMs), "2026-10-01");
  assert.equal(iso(period.toExclusiveMs), "2027-01-01");
  assert.equal(period.label, "4. čtvrtletí 2026 (1. 10. – 31. 12. 2026)");
  assert.deepEqual(period.nextParams, { period: "quarter", anchor: "2027-01-01" });
  assert.deepEqual(period.prevParams, { period: "quarter", anchor: "2026-07-01" });
});

test("valid custom range", () => {
  const period = resolvePerformancePeriod(
    { period: "custom", from: "2025-03-03", to: "2025-03-09" },
    TODAY,
  );
  assert.equal(period.kind, "custom");
  assert.equal(iso(period.fromMs), "2025-03-03");
  assert.equal(iso(period.toExclusiveMs), "2025-03-10");
  assert.equal(period.label, "3. 3. – 9. 3. 2025");
  assert.deepEqual(period.params, { period: "custom", from: "2025-03-03", to: "2025-03-09" });
  assert.deepEqual(period.prevParams, { period: "custom", from: "2025-02-24", to: "2025-03-02" });
  assert.deepEqual(period.nextParams, { period: "custom", from: "2025-03-10", to: "2025-03-16" });
  assert.equal(period.containsToday, false);
});

test("from/to without period → custom", () => {
  const period = resolvePerformancePeriod({ from: "2025-03-03", to: "2025-03-09" }, TODAY);
  assert.equal(period.kind, "custom");
});

test("invalid custom range falls back to current month with an error", () => {
  const cases: Array<[Record<string, string>, InvalidPeriodReason]> = [
    [{ period: "custom", from: "2025-03-09", to: "2025-03-03" }, "order"],
    [{ period: "custom", from: "2025-13-01", to: "2025-03-03" }, "format"], // špatné datum
    [{ period: "custom", from: "03.03.2025", to: "2025-03-09" }, "format"],
    [{ period: "custom", from: "2024-01-01", to: "2025-03-09" }, "tooLong"], // > 366 dnů
    [{ period: "custom" }, "missing"],
  ];
  for (const [input, reason] of cases) {
    const period = resolvePerformancePeriod(input, TODAY);
    assert.equal(period.kind, "month", JSON.stringify(input));
    assert.equal(period.error, invalidPeriodMessage(reason));
    assert.equal(iso(period.fromMs), "2026-10-01");
  }
  assert.equal(
    invalidPeriodMessage("order"),
    "Neplatné období – datum Od je pozdější než Do. Zobrazen aktuální měsíc.",
  );
});

test("custom with only Od → until today", () => {
  const period = resolvePerformancePeriod({ from: "2026-10-20" }, TODAY);
  assert.equal(period.toIso, "2026-10-27");
});

test("previous/next month across the year boundary", () => {
  const january = resolvePerformancePeriod(
    { period: "month", anchor: "2027-01-15" },
    TODAY,
  );
  assert.equal(iso(january.fromMs), "2027-01-01");
  assert.deepEqual(january.prevParams, { period: "month", anchor: "2026-12-01" });
  // Aktuální měsíc se neukotvuje.
  const november = resolvePerformancePeriod({ period: "month", anchor: "2026-11-01" }, TODAY);
  assert.deepEqual(november.prevParams, { period: "month" });
});

test("previous week across the year boundary", () => {
  const period = resolvePerformancePeriod({ period: "week", anchor: "2027-01-01" }, TODAY);
  assert.equal(iso(period.fromMs), "2026-12-28");
  assert.equal(period.label, "Týden 28. 12. 2026 – 3. 1. 2027");
  assert.deepEqual(period.prevParams, { period: "week", anchor: "2026-12-21" });
});

test("parseIsoDate rejects impossible dates", () => {
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate("x"), null);
  assert.equal(parseIsoDate("2026-02-28"), Date.UTC(2026, 1, 28));
});

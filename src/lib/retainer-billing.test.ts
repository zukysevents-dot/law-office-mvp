import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeRetainerSplit,
  formatRetainerPeriod,
  parseRetainerPeriod,
  retainerPeriodBounds,
} from "./retainer-billing";

const wl = (id: string, hours: number) => ({ id, hours });

test("computeRetainerSplit: empty → all zero", () => {
  assert.deepEqual(computeRetainerSplit(10, []), {
    coveredIds: [],
    overageIds: [],
    coveredHours: 0,
    overageHours: 0,
  });
});

test("computeRetainerSplit: all under cap → all covered, no overage", () => {
  const r = computeRetainerSplit(10, [wl("a", 5), wl("b", 4)]);
  assert.deepEqual(r.coveredIds, ["a", "b"]);
  assert.deepEqual(r.overageIds, []);
  assert.equal(r.coveredHours, 9);
  assert.equal(r.overageHours, 0);
});

test("computeRetainerSplit: hours beyond cap go to overage in order", () => {
  const r = computeRetainerSplit(10, [wl("a", 5), wl("b", 5), wl("c", 3)]);
  // a+b reach exactly the cap (acc=10); c starts at acc=10 (not < cap) → overage.
  assert.deepEqual(r.coveredIds, ["a", "b"]);
  assert.deepEqual(r.overageIds, ["c"]);
  assert.equal(r.coveredHours, 10);
  assert.equal(r.overageHours, 3);
});

test("computeRetainerSplit: boundary work-log is NOT split (covered if it starts under cap)", () => {
  const r = computeRetainerSplit(8, [wl("a", 5), wl("b", 5)]);
  // a covered (acc=5); b starts at acc=5 < 8 → whole b covered, coveredHours=10>8.
  assert.deepEqual(r.coveredIds, ["a", "b"]);
  assert.deepEqual(r.overageIds, []);
  assert.equal(r.coveredHours, 10);
  assert.equal(r.overageHours, 0);
});

test("computeRetainerSplit: includedHours null → unlimited coverage", () => {
  const r = computeRetainerSplit(null, [wl("a", 100), wl("b", 50)]);
  assert.deepEqual(r.overageIds, []);
  assert.equal(r.coveredHours, 150);
  assert.equal(r.overageHours, 0);
});

test("computeRetainerSplit: includedHours 0 → everything is overage", () => {
  const r = computeRetainerSplit(0, [wl("a", 2), wl("b", 3)]);
  assert.deepEqual(r.coveredIds, []);
  assert.deepEqual(r.overageIds, ["a", "b"]);
  assert.equal(r.coveredHours, 0);
  assert.equal(r.overageHours, 5);
});

test("computeRetainerSplit: fractional hours sum without drift", () => {
  const r = computeRetainerSplit(1, [wl("a", 0.1), wl("b", 0.2), wl("c", 0.9)]);
  // 0.1 + 0.2 = 0.3 (< 1, covered), 0.9 added (acc 0.3 < 1 → covered, acc 1.2).
  assert.deepEqual(r.coveredIds, ["a", "b", "c"]);
  assert.equal(r.coveredHours, 1.2);
  assert.equal(r.overageHours, 0);
});

test("parseRetainerPeriod: valid YYYY-MM parsed; invalid falls back to current UTC month", () => {
  assert.deepEqual(parseRetainerPeriod("2026-03", new Date("2026-06-15T00:00:00Z")), {
    year: 2026,
    month: 3,
  });
  assert.deepEqual(parseRetainerPeriod("2026-13", new Date("2026-06-15T00:00:00Z")), {
    year: 2026,
    month: 6,
  });
  assert.deepEqual(parseRetainerPeriod(null, new Date("2026-06-15T00:00:00Z")), {
    year: 2026,
    month: 6,
  });
});

test("retainerPeriodBounds: UTC [gte, lt) month bounds", () => {
  const { gte, lt } = retainerPeriodBounds(2026, 6);
  assert.equal(gte.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(lt.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("formatRetainerPeriod: zero-padded MM/YYYY", () => {
  assert.equal(formatRetainerPeriod(2026, 6), "06/2026");
  assert.equal(formatRetainerPeriod(2026, 12), "12/2026");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertNoOverdraw,
  computeRemainingHours,
  daysToHours,
  hoursToDays,
} from "./leave-balance";

test("computeRemainingHours: entitlement + carryover - used, rounded", () => {
  assert.equal(computeRemainingHours(160, 40, 24), 176);
  assert.equal(computeRemainingHours(160, 0, 160), 0);
  assert.equal(computeRemainingHours(160, 0, 168), -8); // overdrawn shows negative
  assert.equal(computeRemainingHours(13.33, 0, 3.33), 10);
  // Decimal entitlement/carryover/used must round to 2 places, not carry float
  // noise (0.1 + 0.2 === 0.30000000000000004 in IEEE-754).
  assert.equal(computeRemainingHours(0.1, 0.2, 0), 0.3);
  // Half-day accrual carryover with a third decimal rounds half-up to 2 places.
  assert.equal(computeRemainingHours(7.555, 0, 0), 7.56);
});

test("hoursToDays / daysToHours: round-trip via dailyHours, guards zero", () => {
  assert.equal(hoursToDays(40, 8), 5);
  assert.equal(daysToHours(5, 8), 40);
  assert.equal(hoursToDays(40, 0), 0); // no divide-by-zero
});

test("assertNoOverdraw: throws only when requested exceeds remaining", () => {
  assert.doesNotThrow(() => assertNoOverdraw(16, 16)); // exact is allowed
  assert.doesNotThrow(() => assertNoOverdraw(16, 8));
  assert.throws(() => assertNoOverdraw(8, 16), {
    message: "Nedostatek zůstatku dovolené pro tuto žádost.",
  });
});

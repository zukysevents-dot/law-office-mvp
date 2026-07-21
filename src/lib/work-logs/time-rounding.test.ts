import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeBillingTimeIncrement,
  roundHoursToIncrement,
} from "./time-rounding";

test("roundHoursToIncrement rounds to tenths for a 6-minute policy", () => {
  assert.equal(roundHoursToIncrement(1.06, 6), 1.1);
  assert.equal(roundHoursToIncrement(0.02, 6), 0.1);
});

test("roundHoursToIncrement rounds to quarters for a 15-minute policy", () => {
  assert.equal(roundHoursToIncrement(1.13, 15), 1.25);
  assert.equal(roundHoursToIncrement(0.02, 15), 0.25);
});

test("unknown policies safely fall back to 15 minutes", () => {
  assert.equal(normalizeBillingTimeIncrement(10), 15);
  assert.equal(roundHoursToIncrement(1.13, 10), 1.25);
});

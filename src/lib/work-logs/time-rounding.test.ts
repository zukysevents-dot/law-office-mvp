import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hoursInputStep,
  incrementHours,
  normalizeBillingTimeIncrement,
  resolveSubmittedHours,
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

test("roundHoursToIncrement nevrací plovoucí šum", () => {
  assert.equal(roundHoursToIncrement(0.29, 6), 0.3);
  assert.equal(roundHoursToIncrement(0.7, 6), 0.7);
  assert.equal(roundHoursToIncrement(1.0 / 3, 6), 0.3);
});

test("incrementHours podle nastavení kanceláře", () => {
  assert.equal(incrementHours(6), 0.1);
  assert.equal(incrementHours(15), 0.25);
  assert.equal(incrementHours(null), 0.25);
});

test("hoursInputStep jde po kroku kanceláře a nezablokuje starší hodnoty", () => {
  assert.equal(hoursInputStep(6), "0.1");
  assert.equal(hoursInputStep(15), "0.25");
  assert.equal(hoursInputStep(6, 0.3), "0.1");
  assert.equal(hoursInputStep(6, 1.7), "0.1");
  assert.equal(hoursInputStep(15, 1.75), "0.25");
  // 1,25 h z doby čtvrthodinového kroku po přepnutí na 0,1 h
  assert.equal(hoursInputStep(6, 1.25), "0.05");
  // 0,3 h z doby kroku 0,1 h po přepnutí na čtvrthodiny
  assert.equal(hoursInputStep(15, 0.3), "0.05");
  assert.equal(hoursInputStep(15, 0.33), "0.01");
});

test("resolveSubmittedHours zachová nezměněnou hodnotu a změněnou zaokrouhlí", () => {
  assert.equal(resolveSubmittedHours(1.25, "1.25", 6), 1.25);
  assert.equal(resolveSubmittedHours(1.3, "1.25", 6), 1.3);
  assert.equal(resolveSubmittedHours(1.33, "1.25", 6), 1.3);
  assert.equal(resolveSubmittedHours(0.3, 0.5, 15), 0.25);
  assert.equal(resolveSubmittedHours(0.3, null, 6), 0.3);
});

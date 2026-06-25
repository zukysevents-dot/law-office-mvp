import assert from "node:assert/strict";
import { test } from "node:test";

import { optionalDateTime, requiredDateTime } from "./form";

// Helper: build a FormData fixture carrying a single field.
// The form helpers always read via `formData.get(key)`, so a one-field
// fixture is enough to exercise the parsing/normalization branches.
const fd = (key: string, value: string): FormData => {
  const formData = new FormData();
  formData.set(key, value);
  return formData;
};

// --- optionalDateTime: <input type="datetime-local"> parsing ----------------
// The field arrives as a local wall-clock string with NO timezone, e.g.
// "2026-06-25T14:30". The helper appends ":00Z" when the length is exactly 16
// so the entered wall-clock is stored as that same instant in UTC (consistent
// with how date-only fields are pinned to UTC midnight elsewhere).

test("optionalDateTime: 'YYYY-MM-DDTHH:mm' (len 16) → exact UTC instant", () => {
  const parsed = optionalDateTime(fd("at", "2026-06-25T14:30"), "at");
  assert.ok(parsed instanceof Date);
  // Wall-clock 14:30 must be the SAME number on the UTC clock, not shifted
  // by the machine's local offset — this is the whole point of appending Z.
  assert.equal(parsed?.toISOString(), "2026-06-25T14:30:00.000Z");
  assert.equal(
    parsed?.getTime(),
    Date.UTC(2026, 5, 25, 14, 30, 0, 0),
  );
});

test("optionalDateTime: midnight wall-clock stays at UTC midnight", () => {
  const parsed = optionalDateTime(fd("at", "2026-01-01T00:00"), "at");
  assert.equal(parsed?.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("optionalDateTime: value WITH seconds (no zone) is pinned to UTC", () => {
  // A bare local datetime that includes seconds is normalized to UTC too (the
  // helper matches "YYYY-MM-DDTHH:mm:ss" and appends "Z"), so the entered
  // wall-clock is stored as that same instant regardless of the runner's TZ.
  const parsed = optionalDateTime(fd("at", "2026-06-25T14:30:45"), "at");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed?.toISOString(), "2026-06-25T14:30:45.000Z");
});

test("optionalDateTime: explicit-Z value (len != 16) is honoured as UTC", () => {
  // A full ISO string with explicit Z is left untouched and parsed as UTC.
  const parsed = optionalDateTime(fd("at", "2026-06-25T14:30:45Z"), "at");
  assert.equal(parsed?.toISOString(), "2026-06-25T14:30:45.000Z");
});

test("optionalDateTime: empty string → null", () => {
  assert.equal(optionalDateTime(fd("at", ""), "at"), null);
});

test("optionalDateTime: whitespace-only → null", () => {
  // optionalString trims; "   " collapses to empty → treated as missing.
  assert.equal(optionalDateTime(fd("at", "   "), "at"), null);
});

test("optionalDateTime: missing key → null", () => {
  assert.equal(optionalDateTime(new FormData(), "at"), null);
});

test("optionalDateTime: unparseable value ('abc') → null (does NOT throw)", () => {
  assert.equal(optionalDateTime(fd("at", "abc"), "at"), null);
});

test("optionalDateTime: datetime-shaped but invalid → null", () => {
  // Non-digit time part fails the normalization regex AND new Date() → null.
  assert.equal(optionalDateTime(fd("at", "2026-13-99Txx:yy"), "at"), null);
  // Digit-shaped but out-of-range (month 13) normalizes to "...Z" then Date
  // rejects it → null (no throw).
  assert.equal(optionalDateTime(fd("at", "2026-13-09T10:00"), "at"), null);
});

// --- requiredDateTime: same parsing, but throws on absent/invalid -----------

test("requiredDateTime: valid value → Date (does not throw)", () => {
  const parsed = requiredDateTime(fd("at", "2026-06-25T14:30"), "at");
  assert.equal(parsed.toISOString(), "2026-06-25T14:30:00.000Z");
});

test("requiredDateTime: empty string → throws with the key in the message", () => {
  assert.throws(
    () => requiredDateTime(fd("at", ""), "at"),
    /Missing required datetime: at/,
  );
});

test("requiredDateTime: missing key → throws", () => {
  assert.throws(
    () => requiredDateTime(new FormData(), "at"),
    /Missing required datetime: at/,
  );
});

test("requiredDateTime: unparseable value ('abc') → throws", () => {
  assert.throws(
    () => requiredDateTime(fd("at", "abc"), "at"),
    /Missing required datetime: at/,
  );
});

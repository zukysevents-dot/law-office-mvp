import assert from "node:assert/strict";
import { test } from "node:test";

import {
  indexedRows,
  optionalDateTime,
  requiredDateTime,
  safeInternalRedirectPath,
} from "./form";

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

// --- safeInternalRedirectPath ----------------------------------------------

test("safeInternalRedirectPath: preserves a same-origin path, query and hash", () => {
  assert.equal(
    safeInternalRedirectPath("/cases/abc?tab=tasks#new", "/references"),
    "/cases/abc?tab=tasks#new",
  );
});

test("safeInternalRedirectPath: rejects absolute and protocol-relative URLs", () => {
  assert.equal(
    safeInternalRedirectPath("https://evil.example/phish", "/references"),
    "/references",
  );
  assert.equal(
    safeInternalRedirectPath("//evil.example/phish", "/references"),
    "/references",
  );
});

test("safeInternalRedirectPath: rejects backslash origin confusion", () => {
  assert.equal(
    safeInternalRedirectPath("/\\evil.example/phish", "/references"),
    "/references",
  );
});

test("safeInternalRedirectPath: falls back for absent or non-string values", () => {
  assert.equal(safeInternalRedirectPath(null, "/references"), "/references");
  assert.equal(safeInternalRedirectPath(42, "/references"), "/references");
});

// --- indexedRows: repeated `prefix.<key>.<field>` rows --------------------

test("indexedRows: groups by row key in DOM order and trims values", () => {
  const formData = new FormData();
  formData.append("contact.b.type", "EMAIL");
  formData.append("contact.b.value", "  b@example.cz ");
  formData.append("contact.a.type", "PHONE");
  formData.append("contact.a.value", "777 123 456");
  formData.append("contact.a.primary", "on");
  formData.append("name", "ignored");

  const rows = indexedRows(formData, "contact", ["type", "value", "primary"]);
  assert.deepEqual(rows, [
    { key: "b", values: { type: "EMAIL", value: "b@example.cz", primary: "" } },
    { key: "a", values: { type: "PHONE", value: "777 123 456", primary: "on" } },
  ]);
});

test("indexedRows: ignores unknown fields, foreign prefixes and bad keys", () => {
  const formData = new FormData();
  formData.append("contact.x.evil", "1");
  formData.append("contactx.y.value", "1");
  formData.append("contact.bad key.value", "1");
  formData.append("contact..value", "1");
  formData.append("contact.ok.value", "v");

  assert.deepEqual(indexedRows(formData, "contact", ["value"]), [
    { key: "ok", values: { value: "v" } },
  ]);
});

test("indexedRows: caps the number of rows", () => {
  const formData = new FormData();
  for (let i = 0; i < 150; i += 1) {
    formData.append(`row.k${i}.value`, String(i));
  }
  const rows = indexedRows(formData, "row", ["value"]);
  assert.equal(rows.length, 100);
  assert.equal(rows[99].values.value, "99");
});

test("indexedRows: a duplicated control does not override the first value", () => {
  const formData = new FormData();
  formData.append("row.a.value", "first");
  formData.append("row.a.value", "second");
  assert.equal(indexedRows(formData, "row", ["value"])[0].values.value, "first");
});

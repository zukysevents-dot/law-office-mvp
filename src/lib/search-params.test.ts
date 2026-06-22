import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQuery, firstParam, parseDateBoundary } from "./search-params";

// parseDateBoundary is the one piece of logic with real branches: regex shape
// check, calendar validity (NaN guard), and start/end-of-day UTC pinning. It
// backs both the billing and report date filters, so a regression here silently
// widens or breaks every dated query.
test("parseDateBoundary: valid date → UTC start of day", () => {
  assert.equal(
    parseDateBoundary("2026-01-15", false)?.toISOString(),
    "2026-01-15T00:00:00.000Z",
  );
});

test("parseDateBoundary: valid date, endOfDay → UTC end of day", () => {
  assert.equal(
    parseDateBoundary("2026-01-15", true)?.toISOString(),
    "2026-01-15T23:59:59.999Z",
  );
});

test("parseDateBoundary: empty string → undefined (no filter)", () => {
  assert.equal(parseDateBoundary("", false), undefined);
});

test("parseDateBoundary: non-date string → undefined (regex guard)", () => {
  assert.equal(parseDateBoundary("garbage", false), undefined);
});

test("parseDateBoundary: wrong shape (single-digit parts) → undefined", () => {
  assert.equal(parseDateBoundary("2026-1-5", false), undefined);
});

test("parseDateBoundary: well-shaped but calendar-invalid → undefined (NaN guard)", () => {
  // Passes /^\d{4}-\d{2}-\d{2}$/ but month 13 makes an Invalid Date.
  assert.equal(parseDateBoundary("2026-13-01", false), undefined);
});

// filterQuery serializes a flat filter map for export/navigation links.
test("filterQuery: drops empty values, preserves insertion order", () => {
  assert.equal(
    filterQuery({ subjectId: "s1", projectId: "", caseId: "c1" }),
    "subjectId=s1&caseId=c1",
  );
});

test("filterQuery: empty map → empty string", () => {
  assert.equal(filterQuery({}), "");
});

test("filterQuery: URL-encodes special characters", () => {
  assert.equal(filterQuery({ q: "a b&c" }), "q=a+b%26c");
});

// firstParam normalizes a Next.js searchParams entry to a single string.
test("firstParam: plain string value", () => {
  assert.equal(firstParam({ k: "x" }, "k"), "x");
});

test("firstParam: array value → first element", () => {
  assert.equal(firstParam({ k: ["a", "b"] }, "k"), "a");
});

test("firstParam: missing key → empty string", () => {
  assert.equal(firstParam({}, "k"), "");
});

test("firstParam: undefined value → empty string", () => {
  assert.equal(firstParam({ k: undefined }, "k"), "");
});

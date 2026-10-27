import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterFormKey,
  filterQuery,
  firstParam,
  hrefWithout,
  parseDateBoundary,
  stripDialogParams,
} from "./search-params";

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

// filterFormKey remounts uncontrolled GET filter forms when the query changes
// ("Zrušit filtry" must visibly reset every select, not just the URL).
test("filterFormKey: empty query → constant key", () => {
  assert.equal(filterFormKey({}), "all");
  assert.equal(filterFormKey({ subjectId: "", userId: undefined }), "all");
});

test("filterFormKey: different filters → different keys, order-independent", () => {
  const a = filterFormKey({ subjectId: "s1", userId: "u1" });
  const b = filterFormKey({ userId: "u1", subjectId: "s1" });
  assert.equal(a, b);
  assert.notEqual(a, filterFormKey({ subjectId: "s1" }));
  assert.notEqual(a, filterFormKey({}));
});

test("filterFormKey: ignored keys (dialog params) do not change the key", () => {
  assert.equal(
    filterFormKey({ subjectId: "s1", new: "1", duplicate: "x" }, ["new", "duplicate"]),
    filterFormKey({ subjectId: "s1" }),
  );
});

test("filterFormKey: array values are all included", () => {
  assert.notEqual(
    filterFormKey({ status: ["A", "B"] }),
    filterFormKey({ status: ["A"] }),
  );
});

// stripDialogParams: po uložení výkazu z dialogu se uživatel vrátí na stejnou
// stránku, ale dialog se nesmí znovu otevřít.
test("stripDialogParams: odstraní dialogové parametry, ostatní a hash zachová", () => {
  assert.equal(
    stripDialogParams("/tasks?status=CREATED&logWork=t1&projectId=p1#list"),
    "/tasks?status=CREATED&projectId=p1#list",
  );
  assert.equal(stripDialogParams("/tasks/t1?logWork=1"), "/tasks/t1");
  assert.equal(
    stripDialogParams("/work-logs?new=1&hours=1.5&duplicate=w1&userId=u1"),
    "/work-logs?userId=u1",
  );
  assert.equal(stripDialogParams("/tasks/t1"), "/tasks/t1");
  assert.equal(stripDialogParams("/tasks/t1#a"), "/tasks/t1#a");
});

test("hrefWithout: zahodí vybrané parametry a přidá extra", () => {
  assert.equal(
    hrefWithout("/tasks", { status: "CREATED", logWork: "t1", tag: ["a", "b"] }, ["logWork"]),
    "/tasks?status=CREATED&tag=a&tag=b",
  );
  assert.equal(hrefWithout("/tasks/my", { logWork: "t1" }, ["logWork"]), "/tasks/my");
  assert.equal(
    hrefWithout("/tasks", { status: "CREATED", logWork: "x" }, ["logWork"], { logWork: "t2" }),
    "/tasks?status=CREATED&logWork=t2",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  deadlineExtensionSummary,
  EXTENSION_DATE_INVALID_ERROR,
  EXTENSION_NOT_LATER_ERROR,
  EXTENSION_REASON_MAX,
  EXTENSION_REASON_REQUIRED_ERROR,
  EXTENSION_REASON_TOO_LONG_ERROR,
  parseDeadlineExtension,
} from "@/lib/deadline-extension";

const CURRENT = new Date("2026-11-10T00:00:00.000Z");

test("parseDeadlineExtension: later date + reason → UTC midnight + trimmed reason", () => {
  const result = parseDeadlineExtension(CURRENT, " 2026-11-20 ", "  Žádost soudu  ");
  assert.equal(result.newDueDate.toISOString(), "2026-11-20T00:00:00.000Z");
  assert.equal(result.reason, "Žádost soudu");
});

test("parseDeadlineExtension: the new date must be strictly later", () => {
  assert.throws(
    () => parseDeadlineExtension(CURRENT, "2026-11-10", "důvod"),
    { message: EXTENSION_NOT_LATER_ERROR },
  );
  assert.throws(
    () => parseDeadlineExtension(CURRENT, "2026-11-09", "důvod"),
    { message: EXTENSION_NOT_LATER_ERROR },
  );
});

test("parseDeadlineExtension: invalid or missing date", () => {
  for (const value of ["", null, undefined, "10. 11. 2026", "2026-02-30", "2026-13-01"]) {
    assert.throws(
      () => parseDeadlineExtension(CURRENT, value, "důvod"),
      { message: EXTENSION_DATE_INVALID_ERROR },
      String(value),
    );
  }
});

test("parseDeadlineExtension: reason is required and bounded", () => {
  assert.throws(
    () => parseDeadlineExtension(CURRENT, "2026-11-20", "   "),
    { message: EXTENSION_REASON_REQUIRED_ERROR },
  );
  assert.throws(
    () => parseDeadlineExtension(CURRENT, "2026-11-20", null),
    { message: EXTENSION_REASON_REQUIRED_ERROR },
  );
  assert.throws(
    () => parseDeadlineExtension(CURRENT, "2026-11-20", "x".repeat(EXTENSION_REASON_MAX + 1)),
    { message: EXTENSION_REASON_TOO_LONG_ERROR },
  );
});

test("deadlineExtensionSummary: count + original due date of the oldest extension", () => {
  assert.deepEqual(deadlineExtensionSummary([]), { count: 0, originalDueDate: null });
  const summary = deadlineExtensionSummary([
    {
      previousDueDate: new Date("2026-11-20T00:00:00.000Z"),
      newDueDate: new Date("2026-11-30T00:00:00.000Z"),
      createdAt: new Date("2026-11-05T10:00:00.000Z"),
    },
    {
      previousDueDate: new Date("2026-11-10T00:00:00.000Z"),
      newDueDate: new Date("2026-11-20T00:00:00.000Z"),
      createdAt: new Date("2026-11-01T10:00:00.000Z"),
    },
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.originalDueDate?.toISOString(), "2026-11-10T00:00:00.000Z");
});

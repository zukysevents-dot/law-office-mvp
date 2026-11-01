import assert from "node:assert/strict";
import test from "node:test";

import {
  dueDateState,
  isDueToday,
  isPastDueDate,
  officeTodayStart,
  officeTomorrowStart,
  overdueBefore,
} from "@/lib/due-date";

// 1. 11. 2026 10:00 Praha (CET, UTC+1).
const MORNING = new Date("2026-11-01T09:00:00.000Z");

test("dueDateState: a due date of today is 'today', not overdue", () => {
  assert.equal(dueDateState(new Date("2026-11-01T00:00:00.000Z"), MORNING), "today");
  assert.equal(isPastDueDate("2026-11-01T00:00:00.000Z", MORNING), false);
  assert.equal(isDueToday("2026-11-01T00:00:00.000Z", MORNING), true);
});

test("dueDateState: overdue only from the following office day", () => {
  assert.equal(dueDateState("2026-10-31T00:00:00.000Z", MORNING), "overdue");
  assert.equal(dueDateState("2026-11-02T00:00:00.000Z", MORNING), "upcoming");
  // Late evening of the due day is still „dnes".
  const lateEvening = new Date("2026-11-01T22:59:00.000Z"); // 23:59 Praha
  assert.equal(dueDateState("2026-11-01T00:00:00.000Z", lateEvening), "today");
  // Just after Prague midnight it becomes overdue (UTC is still 1. 11.).
  const afterMidnight = new Date("2026-11-01T23:05:00.000Z"); // 2. 11. 00:05 Praha
  assert.equal(dueDateState("2026-11-01T00:00:00.000Z", afterMidnight), "overdue");
  assert.equal(dueDateState("2026-11-02T00:00:00.000Z", afterMidnight), "today");
});

test("dueDateState: summer time (CEST) boundary", () => {
  const justAfterMidnight = new Date("2026-07-20T22:30:00.000Z"); // 21. 7. 00:30 Praha
  assert.equal(dueDateState("2026-07-21T00:00:00.000Z", justAfterMidnight), "today");
  assert.equal(dueDateState("2026-07-20T00:00:00.000Z", justAfterMidnight), "overdue");
});

test("dueDateState: no / invalid date → null", () => {
  assert.equal(dueDateState(null, MORNING), null);
  assert.equal(dueDateState(undefined, MORNING), null);
  assert.equal(dueDateState("nonsense", MORNING), null);
  assert.equal(isPastDueDate(null, MORNING), false);
});

test("officeTodayStart / overdueBefore / officeTomorrowStart are Prague day bounds", () => {
  assert.equal(officeTodayStart(MORNING).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(overdueBefore(MORNING).toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(officeTomorrowStart(MORNING).toISOString(), "2026-11-02T00:00:00.000Z");
  const afterMidnight = new Date("2026-11-01T23:05:00.000Z");
  assert.equal(overdueBefore(afterMidnight).toISOString(), "2026-11-02T00:00:00.000Z");
});

test("Prisma bound matches the pure state: lt overdueBefore ⇔ overdue", () => {
  const days = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
  for (const day of days) {
    const value = new Date(`${day}T00:00:00.000Z`);
    assert.equal(
      value < overdueBefore(MORNING),
      dueDateState(value, MORNING) === "overdue",
      day,
    );
  }
});

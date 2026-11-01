import assert from "node:assert/strict";
import test from "node:test";

import { DeadlineStatus } from "@/generated/prisma/enums";
import {
  calendarDeadlineWhere,
  deadlineListWhere,
  FULFILLED_IN_FUTURE_ERROR,
  normalizeDeadlineListView,
  parseFulfilledOn,
  pragueTodayIso,
} from "@/lib/deadlines";
import { deadlineReminderWhere } from "@/lib/notifications/notification-service";

test("normalizeDeadlineListView accepts the three tabs and falls back to active", () => {
  assert.equal(normalizeDeadlineListView("active"), "active");
  assert.equal(normalizeDeadlineListView("fulfilled"), "fulfilled");
  assert.equal(normalizeDeadlineListView("archived"), "archived");
  assert.equal(normalizeDeadlineListView("all"), "active");
  assert.equal(normalizeDeadlineListView(undefined), "active");
  assert.equal(normalizeDeadlineListView(["fulfilled"]), "active");
});

test("deadlineListWhere: active = open not archived", () => {
  assert.deepEqual(deadlineListWhere("active"), {
    archivedAt: null,
    status: DeadlineStatus.OPEN,
  });
});

test("deadlineListWhere: fulfilled = completed not archived", () => {
  assert.deepEqual(deadlineListWhere("fulfilled"), {
    archivedAt: null,
    status: DeadlineStatus.COMPLETED,
  });
});

test("deadlineListWhere: archive = anything archived (fulfilled + cancelled)", () => {
  assert.deepEqual(deadlineListWhere("archived"), { archivedAt: { not: null } });
});

test("calendarDeadlineWhere hides cancelled, keeps archived fulfilled deadlines", () => {
  assert.deepEqual(calendarDeadlineWhere(), {
    status: { not: DeadlineStatus.CANCELLED },
    OR: [{ archivedAt: null }, { status: DeadlineStatus.COMPLETED }],
  });
});

test("deadline reminders scan only open, non-archived deadlines", () => {
  const maxWindow = new Date("2026-11-30T00:00:00.000Z");
  const where = deadlineReminderWhere(maxWindow);
  assert.equal(where.status, DeadlineStatus.OPEN);
  assert.equal(where.archivedAt, null);
  assert.deepEqual(where.dueDate, { lte: maxWindow });
});

test("pragueTodayIso uses the Prague calendar day", () => {
  // 23:30 UTC on 26 Oct (CET, +1) is already 27 Oct in Prague.
  assert.equal(pragueTodayIso(new Date("2026-10-26T23:30:00.000Z")), "2026-10-27");
  // 21:30 UTC on 1 Jul (CEST, +2) is 23:30 the same day.
  assert.equal(pragueTodayIso(new Date("2026-07-01T21:30:00.000Z")), "2026-07-01");
});

test("parseFulfilledOn: empty value defaults to today in Prague (UTC midnight)", () => {
  const now = new Date("2026-10-26T23:30:00.000Z");
  assert.equal(parseFulfilledOn("", now).toISOString(), "2026-10-27T00:00:00.000Z");
  assert.equal(parseFulfilledOn(null, now).toISOString(), "2026-10-27T00:00:00.000Z");
});

test("parseFulfilledOn: past and today are accepted", () => {
  const now = new Date("2026-10-26T10:00:00.000Z");
  assert.equal(
    parseFulfilledOn("2026-10-20", now).toISOString(),
    "2026-10-20T00:00:00.000Z",
  );
  assert.equal(
    parseFulfilledOn("2026-10-26", now).toISOString(),
    "2026-10-26T00:00:00.000Z",
  );
});

test("parseFulfilledOn: a future date is rejected in Czech", () => {
  const now = new Date("2026-10-26T10:00:00.000Z");
  assert.throws(() => parseFulfilledOn("2026-10-27", now), {
    message: FULFILLED_IN_FUTURE_ERROR,
  });
  // Just before Prague midnight the next day is still the future.
  assert.throws(
    () => parseFulfilledOn("2026-10-27", new Date("2026-10-26T22:59:00.000Z")),
    { message: FULFILLED_IN_FUTURE_ERROR },
  );
  // ...and allowed right after it.
  assert.equal(
    parseFulfilledOn("2026-10-27", new Date("2026-10-26T23:01:00.000Z")).toISOString(),
    "2026-10-27T00:00:00.000Z",
  );
});

test("parseFulfilledOn: garbage and impossible dates are rejected", () => {
  const now = new Date("2026-10-26T10:00:00.000Z");
  assert.throws(() => parseFulfilledOn("26.10.2026", now));
  assert.throws(() => parseFulfilledOn("2026-02-30", now));
});

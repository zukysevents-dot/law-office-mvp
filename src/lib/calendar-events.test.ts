import assert from "node:assert/strict";
import test from "node:test";

import { serializeCalendarEvent, toCalendarWireDate } from "@/lib/calendar-events";

test("toCalendarWireDate keeps all-day events on their stored date", () => {
  assert.equal(toCalendarWireDate(new Date("2026-11-03T00:00:00.000Z"), true), "2026-11-03");
});

test("toCalendarWireDate keeps the entered time of timed events (no zone suffix)", () => {
  // Court hearing entered as 09:30 (pinned to UTC by form.ts).
  assert.equal(
    toCalendarWireDate(new Date("2026-11-03T09:30:00.000Z"), false),
    "2026-11-03T09:30:00",
  );
});

test("serializeCalendarEvent adds the wire start/end", () => {
  const serialized = serializeCalendarEvent({
    id: "hearing:1",
    title: "Jednání",
    date: new Date("2026-11-03T09:30:00.000Z"),
    end: new Date("2026-11-03T10:30:00.000Z"),
    allDay: false,
    tone: "purple",
    kind: "hearing",
  });
  assert.equal(serialized.start, "2026-11-03T09:30:00");
  assert.equal(serialized.end, "2026-11-03T10:30:00");
  assert.equal(serialized.dateIso, "2026-11-03T09:30:00.000Z");
  assert.equal("date" in serialized, false);
});

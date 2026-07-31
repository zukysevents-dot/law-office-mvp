import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCalendarView } from "@/lib/calendar-view";

test("normalizeCalendarView accepts all supported calendar views", () => {
  for (const view of ["timeGridDay", "timeGridWeek", "dayGridMonth", "listYear"]) {
    assert.equal(normalizeCalendarView(view), view);
  }
});

test("normalizeCalendarView safely falls back to month", () => {
  assert.equal(normalizeCalendarView("agendaWeek"), "dayGridMonth");
  assert.equal(normalizeCalendarView(null), "dayGridMonth");
});

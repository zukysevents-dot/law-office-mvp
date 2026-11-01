import assert from "node:assert/strict";
import test from "node:test";

import {
  availableCalendarScopes,
  calendarPeopleFilters,
  resolveCalendarScope,
} from "@/lib/calendar-scope";

test("availableCalendarScopes: everyone has mine; team/all only with the right", () => {
  assert.deepEqual(availableCalendarScopes({ hasTeam: false, canViewOffice: false }), [
    "mine",
  ]);
  assert.deepEqual(availableCalendarScopes({ hasTeam: true, canViewOffice: false }), [
    "mine",
    "team",
  ]);
  assert.deepEqual(availableCalendarScopes({ hasTeam: false, canViewOffice: true }), [
    "mine",
    "all",
  ]);
  assert.deepEqual(availableCalendarScopes({ hasTeam: true, canViewOffice: true }), [
    "mine",
    "team",
    "all",
  ]);
});

test("resolveCalendarScope: default mine, a forbidden scope falls back to it", () => {
  assert.equal(resolveCalendarScope(undefined, ["mine", "team", "all"]), "mine");
  assert.equal(resolveCalendarScope("all", ["mine", "team", "all"]), "all");
  assert.equal(resolveCalendarScope("all", ["mine", "team"]), "mine");
  assert.equal(resolveCalendarScope("team", ["mine"]), "mine");
  assert.equal(resolveCalendarScope("whatever", ["mine", "all"]), "mine");
  assert.equal(resolveCalendarScope(["all"], ["mine", "all"]), "mine");
});

test("calendarPeopleFilters: tasks by solver/supervisor/responsible, not by creator of a delegated task", () => {
  const ids = { in: ["u1", "u2"] };
  const filters = calendarPeopleFilters(["u1", "u2"]);
  assert.deepEqual(filters.task, {
    OR: [
      { assignedToId: ids },
      { responsibleUserId: ids },
      { assignees: { some: { userId: ids } } },
      // Unowned task (nobody solves it) stays with its creator only.
      {
        assignedToId: null,
        responsibleUserId: null,
        assignees: { none: {} },
        createdById: ids,
      },
    ],
  });
});

test("calendarPeopleFilters: deadlines and hearings by responsible person or case lawyer; unowned stay with creator and case team", () => {
  const ids = { in: ["u1"] };
  const filters = calendarPeopleFilters(["u1"]);
  const expected = {
    OR: [
      { responsibleUserId: ids },
      { case: { is: { responsibleUserId: ids } } },
      { responsibleUserId: null, createdById: ids },
      {
        responsibleUserId: null,
        case: { is: { assignees: { some: { userId: ids } } } },
      },
    ],
  };
  assert.deepEqual(filters.deadline, expected);
  assert.deepEqual(filters.hearing, expected);
});

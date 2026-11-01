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

test("calendarPeopleFilters: tasks by solver/supervisor/responsible, not by creator", () => {
  const filters = calendarPeopleFilters(["u1", "u2"]);
  assert.deepEqual(filters.task, {
    OR: [
      { assignedToId: { in: ["u1", "u2"] } },
      { responsibleUserId: { in: ["u1", "u2"] } },
      { assignees: { some: { userId: { in: ["u1", "u2"] } } } },
    ],
  });
  assert.equal(JSON.stringify(filters.task).includes("createdById"), false);
});

test("calendarPeopleFilters: deadlines and hearings by responsible person or case lawyer", () => {
  const filters = calendarPeopleFilters(["u1"]);
  const expected = {
    OR: [
      { responsibleUserId: { in: ["u1"] } },
      { case: { is: { responsibleUserId: { in: ["u1"] } } } },
    ],
  };
  assert.deepEqual(filters.deadline, expected);
  assert.deepEqual(filters.hearing, expected);
});

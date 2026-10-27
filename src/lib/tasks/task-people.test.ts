import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_TASK_PEOPLE,
  diffTaskPeople,
  formatAssigneeNames,
  myTaskRoleWhere,
  myTaskRoles,
  normalizeTaskPeople,
  parseMyTaskRole,
  taskAssigneeUserIds,
  taskAssigneeWhere,
  taskCommentRecipients,
  taskCreatedRecipients,
  taskDeadlineSoonRecipients,
  taskFiledRecipients,
  taskOverdueRecipients,
  taskPeopleFromRecord,
  taskPersonWhere,
  taskStatusRecipients,
  taskSupervisorUserIds,
  taskSupervisorWhere,
} from "./task-people";

const A = (userId: string) => ({ userId, role: "ASSIGNEE" as const });
const S = (userId: string) => ({ userId, role: "SUPERVISOR" as const });

// --- normalizeTaskPeople -----------------------------------------------------

test("normalizeTaskPeople: dedupes, primary first, drops invalid ids", () => {
  const result = normalizeTaskPeople({
    assigneeIds: ["u1", " u2 ", "u1", "", "bad id!", 42, "u3"],
    supervisorIds: [],
    primaryAssigneeId: "u3",
  });
  assert.deepEqual(result.assigneeIds, ["u3", "u1", "u2"]);
  assert.equal(result.primaryAssigneeId, "u3");
});

test("normalizeTaskPeople: unknown primary falls back to the first assignee", () => {
  const result = normalizeTaskPeople({
    assigneeIds: ["u1", "u2"],
    supervisorIds: [],
    primaryAssigneeId: "u9",
  });
  assert.deepEqual(result.assigneeIds, ["u1", "u2"]);
  assert.equal(result.primaryAssigneeId, "u1");
});

test("normalizeTaskPeople: legacy assignedToId only when no assignees were sent", () => {
  assert.deepEqual(
    normalizeTaskPeople({
      assigneeIds: [],
      supervisorIds: [],
      legacyAssignedToId: "old",
    }),
    { assigneeIds: ["old"], supervisorIds: [], primaryAssigneeId: "old" },
  );
  assert.deepEqual(
    normalizeTaskPeople({
      assigneeIds: ["new"],
      supervisorIds: [],
      legacyAssignedToId: "old",
    }).assigneeIds,
    ["new"],
  );
  assert.deepEqual(
    normalizeTaskPeople({ assigneeIds: [], supervisorIds: [] }),
    { assigneeIds: [], supervisorIds: [], primaryAssigneeId: null },
  );
});

test("normalizeTaskPeople: assignee wins over supervisor, responsible is no supervisor", () => {
  const result = normalizeTaskPeople({
    assigneeIds: ["u1"],
    supervisorIds: ["u1", "u2", "resp", "u2", "u3"],
    responsibleUserId: "resp",
  });
  assert.deepEqual(result.assigneeIds, ["u1"]);
  assert.deepEqual(result.supervisorIds, ["u2", "u3"]);
});

test("normalizeTaskPeople: caps both lists", () => {
  const many = Array.from({ length: MAX_TASK_PEOPLE + 10 }, (_, i) => `u${i}`);
  const result = normalizeTaskPeople({
    assigneeIds: many,
    supervisorIds: many.map((id) => `s${id}`),
  });
  assert.equal(result.assigneeIds.length, MAX_TASK_PEOPLE);
  assert.equal(result.supervisorIds.length, MAX_TASK_PEOPLE);
});

// --- diffTaskPeople ----------------------------------------------------------

test("diffTaskPeople: add, remove, role switch and no-op", () => {
  const diff = diffTaskPeople([A("u1"), S("u2"), A("u3")], {
    assigneeIds: ["u1", "u2", "u4"],
    supervisorIds: ["u5"],
  });
  assert.deepEqual(diff.add, [A("u4"), S("u5")]);
  assert.deepEqual(diff.remove, [A("u3")]);
  assert.deepEqual(diff.changeRole, [
    { userId: "u2", from: "SUPERVISOR", to: "ASSIGNEE" },
  ]);

  const none = diffTaskPeople([A("u1"), S("u2")], {
    assigneeIds: ["u1"],
    supervisorIds: ["u2"],
  });
  assert.deepEqual(none, { add: [], remove: [], changeRole: [] });
});

// --- čtení lidí ---------------------------------------------------------------

test("taskPeopleFromRecord: union with assignedToId, primary first, no duplicates", () => {
  const view = taskPeopleFromRecord({
    assignedToId: "u2",
    assignedTo: { id: "u2", name: "Bára" },
    assignees: [
      { ...A("u1"), user: { id: "u1", name: "Adam" } },
      { ...A("u2"), user: { id: "u2", name: "Bára" } },
      { ...S("u3"), user: { id: "u3", name: "Cyril" } },
    ],
  });
  assert.deepEqual(view.assignees, [
    { id: "u2", name: "Bára", primary: true },
    { id: "u1", name: "Adam", primary: false },
  ]);
  assert.deepEqual(view.supervisors, [{ id: "u3", name: "Cyril" }]);
  assert.equal(formatAssigneeNames(view.assignees), "Bára (hlavní), Adam");
  assert.equal(
    formatAssigneeNames(view.assignees, { markPrimary: false }),
    "Bára, Adam",
  );
  assert.equal(
    formatAssigneeNames([{ id: "u1", name: "Adam", primary: true }]),
    "Adam",
  );
});

test("taskPeopleFromRecord: legacy task without rows still shows its assignee", () => {
  const view = taskPeopleFromRecord({
    assignedToId: "u1",
    assignedTo: { id: "u1", name: "Adam" },
    assignees: [],
  });
  assert.deepEqual(view.assignees, [{ id: "u1", name: "Adam", primary: true }]);
});

test("assignee / supervisor ids: assignedToId counts as assignee and beats a supervisor row", () => {
  const task = { assignedToId: "u1", assignees: [S("u1"), A("u2"), S("u3")] };
  assert.deepEqual(taskAssigneeUserIds(task), ["u1", "u2"]);
  assert.deepEqual(taskSupervisorUserIds(task), ["u3"]);
});

// --- příjemci notifikací (matice) ----------------------------------------------

const task = {
  createdById: "creator",
  assignedToId: "a1",
  responsibleUserId: "resp",
  assignees: [A("a1"), A("a2"), S("sup")],
};

test("recipients: created — workers vs. supervisors", () => {
  assert.deepEqual(taskCreatedRecipients(task), {
    workers: ["a1", "a2", "resp"],
    supervisors: ["sup"],
  });
});

test("recipients: status and comment include supervisors and the creator", () => {
  for (const fn of [taskStatusRecipients, taskCommentRecipients]) {
    assert.deepEqual(fn(task), ["a1", "a2", "sup", "resp", "creator"]);
  }
});

test("recipients: overdue includes supervisors, not the creator", () => {
  assert.deepEqual(taskOverdueRecipients(task), ["a1", "a2", "sup", "resp"]);
});

test("recipients: deadline soon and filed follow-up skip supervisors", () => {
  assert.deepEqual(taskDeadlineSoonRecipients(task), ["a1", "a2", "resp"]);
  assert.deepEqual(taskFiledRecipients(task), ["a1", "a2", "resp", "creator"]);
});

test("recipients: a person with several roles appears once", () => {
  const overlapping = {
    createdById: "a1",
    assignedToId: "a1",
    responsibleUserId: "a1",
    assignees: [A("a1")],
  };
  assert.deepEqual(taskStatusRecipients(overlapping), ["a1"]);
});

// --- role a where fragmenty ----------------------------------------------------

test("myTaskRoles: assignee or supervisor, plus responsible and creator", () => {
  assert.deepEqual(myTaskRoles(task, "a2"), ["assignee"]);
  assert.deepEqual(myTaskRoles(task, "sup"), ["supervisor"]);
  assert.deepEqual(myTaskRoles(task, "resp"), ["responsible"]);
  assert.deepEqual(myTaskRoles(task, "creator"), ["created"]);
  assert.deepEqual(
    myTaskRoles({ ...task, createdById: "a1", responsibleUserId: "a1" }, "a1"),
    ["assignee", "responsible", "created"],
  );
  assert.deepEqual(myTaskRoles(task, "stranger"), []);
});

test("parseMyTaskRole: only known roles", () => {
  assert.equal(parseMyTaskRole("supervisor"), "supervisor");
  assert.equal(parseMyTaskRole("admin"), "");
  assert.equal(parseMyTaskRole(undefined), "");
});

test("where fragments", () => {
  assert.deepEqual(taskAssigneeWhere("u1"), {
    OR: [
      { assignedToId: "u1" },
      { assignees: { some: { userId: "u1", role: "ASSIGNEE" } } },
    ],
  });
  assert.deepEqual(taskSupervisorWhere("u1"), {
    assignees: { some: { userId: "u1", role: "SUPERVISOR" } },
  });
  assert.deepEqual(taskPersonWhere("u1"), {
    OR: [{ assignedToId: "u1" }, { assignees: { some: { userId: "u1" } } }],
  });
  assert.deepEqual(myTaskRoleWhere("u1", "assignee"), taskAssigneeWhere("u1"));
  assert.deepEqual(myTaskRoleWhere("u1", "supervisor"), taskSupervisorWhere("u1"));
  assert.deepEqual(myTaskRoleWhere("u1", "responsible"), { responsibleUserId: "u1" });
  assert.deepEqual(myTaskRoleWhere("u1", "created"), { createdById: "u1" });
  assert.deepEqual(myTaskRoleWhere("u1", ""), {
    OR: [
      { assignedToId: "u1" },
      { assignees: { some: { userId: "u1" } } },
      { responsibleUserId: "u1" },
      { createdById: "u1" },
    ],
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTaskDuplicatePrefill,
  type TaskDuplicateAllowed,
  type TaskDuplicateSource,
} from "./duplicate";

const source: TaskDuplicateSource = {
  title: "Připravit žalobu",
  priority: "HIGH",
  deadlineType: "COURT",
  deadline: new Date("2026-11-15T00:00:00.000Z"),
  shortDescription: "Krátce",
  detailedDescription: "Detailně",
  sharepointUrl: "https://example.sharepoint.com/x",
  projectId: "p1",
  caseId: "c1",
  caseProjectId: "p1",
  subjectId: "s1",
  assigneeIds: ["u2", "u1", "u3"],
  supervisorIds: ["u4"],
  responsibleUserId: "u5",
};

const allowed: TaskDuplicateAllowed = {
  projectIds: new Set(["p1", "p2"]),
  caseIds: new Set(["c1"]),
  subjectIds: new Set(["s1"]),
  userIds: new Set(["u1", "u2", "u3", "u4", "u5"]),
};

test("buildTaskDuplicatePrefill: zkopíruje vše vč. pořadí řešitelů, začátek = dnes", () => {
  const prefill = buildTaskDuplicatePrefill(source, allowed, "2026-10-27");
  assert.deepEqual(prefill, {
    title: "Připravit žalobu",
    priority: "HIGH",
    deadlineType: "COURT",
    deadline: "2026-11-15",
    startDate: "2026-10-27",
    shortDescription: "Krátce",
    detailedDescription: "Detailně",
    sharepointUrl: "https://example.sharepoint.com/x",
    subjectId: "s1",
    projectId: "p1",
    caseId: "c1",
    assigneeIds: ["u2", "u1", "u3"],
    supervisorIds: ["u4"],
    responsibleUserId: "u5",
    matterDropped: false,
    peopleDropped: false,
  });
});

test("buildTaskDuplicatePrefill: nedostupný projekt shodí projekt i případ", () => {
  const prefill = buildTaskDuplicatePrefill(
    source,
    { ...allowed, projectIds: new Set(["p2"]) },
    "2026-10-27",
  );
  assert.equal(prefill.projectId, "");
  assert.equal(prefill.caseId, "");
  assert.equal(prefill.subjectId, "");
  assert.equal(prefill.matterDropped, true);
});

test("buildTaskDuplicatePrefill: nedostupný případ shodí jen případ", () => {
  const prefill = buildTaskDuplicatePrefill(
    source,
    { ...allowed, caseIds: new Set() },
    "2026-10-27",
  );
  assert.equal(prefill.projectId, "p1");
  assert.equal(prefill.caseId, "");
  assert.equal(prefill.matterDropped, true);
});

test("buildTaskDuplicatePrefill: úkol na případu bez projectId odvodí projekt z případu", () => {
  const prefill = buildTaskDuplicatePrefill(
    { ...source, projectId: null },
    allowed,
    "2026-10-27",
  );
  assert.equal(prefill.projectId, "p1");
  assert.equal(prefill.caseId, "c1");
  assert.equal(prefill.subjectId, "s1");
});

test("buildTaskDuplicatePrefill: úkol bez věci a bez termínu", () => {
  const prefill = buildTaskDuplicatePrefill(
    {
      ...source,
      projectId: null,
      caseId: null,
      caseProjectId: null,
      subjectId: null,
      deadline: null,
      shortDescription: null,
      detailedDescription: null,
      sharepointUrl: null,
    },
    allowed,
    "2026-10-27",
  );
  assert.equal(prefill.projectId, "");
  assert.equal(prefill.caseId, "");
  assert.equal(prefill.subjectId, "");
  assert.equal(prefill.deadline, "");
  assert.equal(prefill.shortDescription, "");
  assert.equal(prefill.matterDropped, false);
});

test("buildTaskDuplicatePrefill: neaktivní osoba vynechána a označena", () => {
  const prefill = buildTaskDuplicatePrefill(
    source,
    { ...allowed, userIds: new Set(["u1", "u3", "u4"]) },
    "2026-10-27",
  );
  assert.deepEqual(prefill.assigneeIds, ["u1", "u3"]);
  assert.deepEqual(prefill.supervisorIds, ["u4"]);
  assert.equal(prefill.responsibleUserId, "");
  assert.equal(prefill.peopleDropped, true);
});

test("buildTaskDuplicatePrefill: dohled, který je i řešitelem, se nezdvojí", () => {
  const prefill = buildTaskDuplicatePrefill(
    { ...source, supervisorIds: ["u1", "u4"] },
    allowed,
    "2026-10-27",
  );
  assert.deepEqual(prefill.supervisorIds, ["u4"]);
});

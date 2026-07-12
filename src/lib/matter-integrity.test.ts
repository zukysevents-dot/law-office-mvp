import assert from "node:assert/strict";
import test from "node:test";

import { resolveMatterSelection } from "./matter-integrity";

test("standalone subject and completely standalone records remain valid", () => {
  assert.deepEqual(resolveMatterSelection({ subjectId: "subject-1" }, {}), {
    subjectId: "subject-1",
    projectId: null,
    caseId: null,
    taskId: null,
  });
  assert.deepEqual(resolveMatterSelection({}, {}), {
    subjectId: null,
    projectId: null,
    caseId: null,
    taskId: null,
  });
});

test("project derives its main subject", () => {
  assert.deepEqual(
    resolveMatterSelection(
      { projectId: "project-1" },
      { project: { id: "project-1", mainSubjectId: "subject-1" } },
    ),
    {
      subjectId: "subject-1",
      projectId: "project-1",
      caseId: null,
      taskId: null,
    },
  );
});

test("case derives its project and subject", () => {
  assert.deepEqual(
    resolveMatterSelection(
      { caseId: "case-1" },
      {
        legalCase: {
          id: "case-1",
          projectId: "project-1",
          mainSubjectId: "subject-1",
        },
      },
    ),
    {
      subjectId: "subject-1",
      projectId: "project-1",
      caseId: "case-1",
      taskId: null,
    },
  );
});

test("case and project from different hierarchies are rejected", () => {
  assert.throws(
    () =>
      resolveMatterSelection(
        { projectId: "project-2", caseId: "case-1" },
        {
          project: { id: "project-2", mainSubjectId: "subject-2" },
          legalCase: {
            id: "case-1",
            projectId: "project-1",
            mainSubjectId: "subject-1",
          },
        },
      ),
    /případ nepatří k vybranému projektu/,
  );
});

test("task derives its case, project, and subject", () => {
  assert.deepEqual(
    resolveMatterSelection(
      { taskId: "task-1" },
      {
        task: {
          id: "task-1",
          caseId: "case-1",
          projectId: "project-1",
          caseProjectId: "project-1",
          mainSubjectId: "subject-1",
        },
      },
    ),
    {
      subjectId: "subject-1",
      projectId: "project-1",
      caseId: "case-1",
      taskId: "task-1",
    },
  );
});

test("task must belong to the selected case", () => {
  assert.throws(
    () =>
      resolveMatterSelection(
        { taskId: "task-1", caseId: "case-2" },
        {
          legalCase: {
            id: "case-2",
            projectId: "project-1",
            mainSubjectId: "subject-1",
          },
          task: {
            id: "task-1",
            caseId: "case-1",
            projectId: "project-1",
            caseProjectId: "project-1",
            mainSubjectId: "subject-1",
          },
        },
      ),
    /úkol nepatří k vybranému případu/,
  );
});

test("task must belong to the selected project", () => {
  assert.throws(
    () =>
      resolveMatterSelection(
        { taskId: "task-1", projectId: "project-2" },
        {
          project: { id: "project-2", mainSubjectId: "subject-2" },
          task: {
            id: "task-1",
            caseId: null,
            projectId: "project-1",
            caseProjectId: null,
            mainSubjectId: "subject-1",
          },
        },
      ),
    /úkol nepatří k vybranému projektu/,
  );
});

test("subject must match the most specific selected matter", () => {
  assert.throws(
    () =>
      resolveMatterSelection(
        { subjectId: "subject-2", caseId: "case-1" },
        {
          legalCase: {
            id: "case-1",
            projectId: "project-1",
            mainSubjectId: "subject-1",
          },
        },
      ),
    /subjekt neodpovídá klientovi vybraného projektu/,
  );
});

test("standalone task can coexist with a standalone subject", () => {
  assert.deepEqual(
    resolveMatterSelection(
      { taskId: "task-1", subjectId: "subject-1" },
      {
        task: {
          id: "task-1",
          caseId: null,
          projectId: null,
          caseProjectId: null,
          mainSubjectId: null,
        },
      },
    ),
    {
      subjectId: "subject-1",
      projectId: null,
      caseId: null,
      taskId: "task-1",
    },
  );
});

test("a task cannot claim a project different from its case", () => {
  assert.throws(
    () =>
      resolveMatterSelection(
        { taskId: "task-1" },
        {
          task: {
            id: "task-1",
            caseId: "case-1",
            projectId: "project-2",
            caseProjectId: "project-1",
            mainSubjectId: "subject-1",
          },
        },
      ),
    /rozpornou vazbu na projekt a případ/,
  );
});

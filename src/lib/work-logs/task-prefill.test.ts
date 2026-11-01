import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskWorkLogPrefill } from "./task-prefill";

test("buildTaskWorkLogPrefill: úkol na případu → projekt a subjekt z případu", () => {
  assert.deepEqual(
    buildTaskWorkLogPrefill({
      id: "t1",
      projectId: null,
      caseId: "c1",
      project: null,
      case: { projectId: "p1", project: { mainSubjectId: "s1" } },
    }),
    { subjectId: "s1", projectId: "p1", caseId: "c1", taskId: "t1" },
  );
});

test("buildTaskWorkLogPrefill: úkol jen na projektu", () => {
  assert.deepEqual(
    buildTaskWorkLogPrefill({
      id: "t2",
      projectId: "p2",
      caseId: null,
      project: { mainSubjectId: "s2" },
      case: null,
    }),
    { subjectId: "s2", projectId: "p2", caseId: "", taskId: "t2" },
  );
});

test("buildTaskWorkLogPrefill: úkol bez věci → jen úkol", () => {
  assert.deepEqual(
    buildTaskWorkLogPrefill({
      id: "t3",
      projectId: null,
      caseId: null,
      project: null,
      case: null,
    }),
    { subjectId: "", projectId: "", caseId: "", taskId: "t3" },
  );
});

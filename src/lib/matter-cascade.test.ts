import assert from "node:assert/strict";
import test from "node:test";

import {
  casesForSelection,
  groupTasksByMine,
  initialCascadeSelection,
  nextSelectionOnCaseChange,
  nextSelectionOnProjectChange,
  nextSelectionOnSubjectChange,
  nextSelectionOnTaskChange,
  projectsForSubject,
  tasksForSelection,
  type MatterCascadeLists,
} from "./matter-cascade";

// Klient A má projekty pA1, pA2; klient B projekt pB. Případy cA1 (pA1),
// cA2 (pA2), cB (pB). Úkoly na případu, na projektu i bez spisu.
const projects = [
  { id: "pA1", mainSubjectId: "A" },
  { id: "pA2", mainSubjectId: "A" },
  { id: "pB", mainSubjectId: "B" },
];
const cases = [
  { id: "cA1", projectId: "pA1" },
  { id: "cA2", projectId: "pA2" },
  { id: "cB", projectId: "pB" },
];
const tasks = [
  { id: "tCaseA1", projectId: null, caseId: "cA1" },
  { id: "tProjA2", projectId: "pA2", caseId: null },
  { id: "tCaseB", projectId: "pB", caseId: "cB" },
  { id: "tFree", projectId: null, caseId: null },
];
const lists: MatterCascadeLists = { projects, cases, tasks };
const empty = { subjectId: "", projectId: "", caseId: "", taskId: "" };
const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

test("projekty se zúží na zvoleného klienta, bez klienta jsou všechny", () => {
  assert.deepEqual(ids(projectsForSubject(projects, "A")), ["pA1", "pA2"]);
  assert.deepEqual(ids(projectsForSubject(projects, "B")), ["pB"]);
  assert.deepEqual(ids(projectsForSubject(projects, "")), ["pA1", "pA2", "pB"]);
});

test("případy podle klienta (bez projektu) i podle projektu", () => {
  assert.deepEqual(
    ids(casesForSelection(cases, projects, { subjectId: "A", projectId: "" })),
    ["cA1", "cA2"],
  );
  assert.deepEqual(
    ids(casesForSelection(cases, projects, { subjectId: "A", projectId: "pA2" })),
    ["cA2"],
  );
  assert.deepEqual(
    ids(casesForSelection(cases, projects, { subjectId: "", projectId: "" })),
    ["cA1", "cA2", "cB"],
  );
  // Klient bez projektů nemá žádné případy.
  assert.deepEqual(
    ids(casesForSelection(cases, projects, { subjectId: "C", projectId: "" })),
    [],
  );
});

test("úkoly podle klienta, projektu a případu", () => {
  assert.deepEqual(
    ids(
      tasksForSelection(tasks, cases, projects, {
        subjectId: "A",
        projectId: "",
        caseId: "",
      }),
    ),
    ["tCaseA1", "tProjA2", "tFree"],
  );
  assert.deepEqual(
    ids(
      tasksForSelection(tasks, cases, projects, {
        subjectId: "A",
        projectId: "pA1",
        caseId: "",
      }),
    ),
    ["tCaseA1"],
  );
  assert.deepEqual(
    ids(
      tasksForSelection(tasks, cases, projects, {
        subjectId: "B",
        projectId: "pB",
        caseId: "cB",
      }),
    ),
    ["tCaseB"],
  );
});

test("změna klienta vynuluje nepasující projekt, případ i úkol", () => {
  const state = { subjectId: "A", projectId: "pA1", caseId: "cA1", taskId: "tCaseA1" };
  assert.deepEqual(nextSelectionOnSubjectChange(state, "B", lists), {
    subjectId: "B",
    projectId: "",
    caseId: "",
    taskId: "",
  });
});

test("změna klienta zachová pasující potomky", () => {
  const state = { subjectId: "", projectId: "pA1", caseId: "cA1", taskId: "tCaseA1" };
  assert.deepEqual(nextSelectionOnSubjectChange(state, "A", lists), {
    subjectId: "A",
    projectId: "pA1",
    caseId: "cA1",
    taskId: "tCaseA1",
  });
  // Úkol bez spisu zůstane i při změně klienta.
  assert.equal(
    nextSelectionOnSubjectChange({ ...empty, subjectId: "A", taskId: "tFree" }, "B", lists)
      .taskId,
    "tFree",
  );
});

test("vymazání klienta vynuluje vše", () => {
  const state = { subjectId: "A", projectId: "pA1", caseId: "cA1", taskId: "tCaseA1" };
  assert.deepEqual(nextSelectionOnSubjectChange(state, "", lists), empty);
});

test("výběr projektu doplní klienta a vynuluje případ z jiného projektu", () => {
  const state = { subjectId: "A", projectId: "pA1", caseId: "cA1", taskId: "tCaseA1" };
  assert.deepEqual(nextSelectionOnProjectChange(state, "pA2", lists), {
    subjectId: "A",
    projectId: "pA2",
    caseId: "",
    taskId: "",
  });
  assert.deepEqual(nextSelectionOnProjectChange(empty, "pB", lists), {
    subjectId: "B",
    projectId: "pB",
    caseId: "",
    taskId: "",
  });
});

test("výběr případu doplní projekt i klienta", () => {
  assert.deepEqual(nextSelectionOnCaseChange(empty, "cA2", lists), {
    subjectId: "A",
    projectId: "pA2",
    caseId: "cA2",
    taskId: "",
  });
});

test("vymazání případu zachová projekt a projektový úkol", () => {
  const state = { subjectId: "A", projectId: "pA2", caseId: "cA2", taskId: "tProjA2" };
  assert.deepEqual(nextSelectionOnCaseChange(state, "", lists), {
    subjectId: "A",
    projectId: "pA2",
    caseId: "",
    taskId: "tProjA2",
  });
});

test("výběr úkolu doplní případ, projekt i klienta; úkol bez spisu je vynuluje", () => {
  assert.deepEqual(nextSelectionOnTaskChange(empty, "tCaseA1", lists), {
    subjectId: "A",
    projectId: "pA1",
    caseId: "cA1",
    taskId: "tCaseA1",
  });
  const state = { subjectId: "A", projectId: "pA1", caseId: "cA1", taskId: "" };
  assert.deepEqual(nextSelectionOnTaskChange(state, "tFree", lists), {
    subjectId: "A",
    projectId: "",
    caseId: "",
    taskId: "tFree",
  });
});

test("počáteční stav z URL doplní nadřazené úrovně", () => {
  assert.deepEqual(initialCascadeSelection({ caseId: "cB" }, lists), {
    subjectId: "B",
    projectId: "pB",
    caseId: "cB",
    taskId: "",
  });
  assert.deepEqual(initialCascadeSelection({ projectId: "pA1" }, lists), {
    subjectId: "A",
    projectId: "pA1",
    caseId: "",
    taskId: "",
  });
});

test("projekt bez klienta (null) nespadne", () => {
  const withOrphan: MatterCascadeLists = {
    projects: [...projects, { id: "pX", mainSubjectId: null }],
    cases,
    tasks,
  };
  assert.deepEqual(nextSelectionOnProjectChange(empty, "pX", withOrphan), {
    subjectId: "",
    projectId: "pX",
    caseId: "",
    taskId: "",
  });
  assert.deepEqual(ids(projectsForSubject(withOrphan.projects, "A")), ["pA1", "pA2"]);
});

test("úkoly: „Moje úkoly“ nahoře, bez vlastních úkolů plochý seznam", () => {
  const withMine = [
    { id: "t1", projectId: null, caseId: null, mine: false },
    { id: "t2", projectId: null, caseId: null, mine: true },
    { id: "t3", projectId: null, caseId: null },
    { id: "t4", projectId: null, caseId: null, mine: true },
  ];
  const grouped = groupTasksByMine(withMine);
  assert.deepEqual(ids(grouped.mine), ["t2", "t4"]);
  assert.deepEqual(ids(grouped.others), ["t1", "t3"]);

  const flat = groupTasksByMine(tasks);
  assert.deepEqual(flat.mine, []);
  assert.deepEqual(ids(flat.others), ids(tasks));
  // Příznak mine prochází filtrováním kaskády beze změny.
  const filtered = tasksForSelection(
    [{ id: "tm", projectId: null, caseId: "cA1", mine: true }],
    cases,
    projects,
    { subjectId: "", projectId: "", caseId: "cA1" },
  );
  assert.equal(filtered[0]?.mine, true);
});

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
  subjectNeedsCase,
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

// Více klientů na spisu: projekt pM hlavního klienta M, další klient P na
// projektu (platí pro všechny případy) a klient Q jen na případu cM2.
const multiProjects = [
  { id: "pM", mainSubjectId: "M", clientSubjectIds: ["P"] },
  { id: "pO", mainSubjectId: "O" },
];
const multiCases = [
  { id: "cM1", projectId: "pM" },
  { id: "cM2", projectId: "pM", clientSubjectIds: ["Q"] },
  { id: "cO", projectId: "pO" },
];
const multiTasks = [
  { id: "tM1", projectId: null, caseId: "cM1" },
  { id: "tM2", projectId: null, caseId: "cM2" },
  { id: "tPM", projectId: "pM", caseId: null },
];
const multiLists: MatterCascadeLists = {
  projects: multiProjects,
  cases: multiCases,
  tasks: multiTasks,
};

test("více klientů: další klient vidí projekt a případy spisu", () => {
  assert.deepEqual(ids(projectsForSubject(multiProjects, "P", multiCases)), ["pM"]);
  // Klient jen na případu vidí projekt (aby došel k případu) a jen ten případ.
  assert.deepEqual(ids(projectsForSubject(multiProjects, "Q", multiCases)), ["pM"]);
  assert.deepEqual(
    ids(casesForSelection(multiCases, multiProjects, { subjectId: "Q", projectId: "" })),
    ["cM2"],
  );
  assert.deepEqual(
    ids(casesForSelection(multiCases, multiProjects, { subjectId: "Q", projectId: "pM" })),
    ["cM2"],
  );
  assert.deepEqual(
    ids(casesForSelection(multiCases, multiProjects, { subjectId: "P", projectId: "pM" })),
    ["cM1", "cM2"],
  );
  // Hlavní klient vidí všechny případy projektu.
  assert.deepEqual(
    ids(casesForSelection(multiCases, multiProjects, { subjectId: "M", projectId: "pM" })),
    ["cM1", "cM2"],
  );
  // Bez clientSubjectIds se nic nemění (projekt bez případů pro cizího klienta).
  assert.deepEqual(ids(projectsForSubject(multiProjects, "Q")), []);
});

test("více klientů: úkoly podle dalšího klienta", () => {
  assert.deepEqual(
    ids(
      tasksForSelection(multiTasks, multiCases, multiProjects, {
        subjectId: "Q",
        projectId: "",
        caseId: "",
      }),
    ),
    ["tM2"],
  );
  assert.deepEqual(
    ids(
      tasksForSelection(multiTasks, multiCases, multiProjects, {
        subjectId: "P",
        projectId: "",
        caseId: "",
      }),
    ),
    ["tM1", "tM2", "tPM"],
  );
});

test("více klientů: výběr případu ponechá zvoleného dalšího klienta", () => {
  assert.deepEqual(
    nextSelectionOnCaseChange({ ...empty, subjectId: "Q" }, "cM2", multiLists),
    { subjectId: "Q", projectId: "pM", caseId: "cM2", taskId: "" },
  );
  // Klient, který k případu nepatří, se nahradí hlavním klientem projektu.
  assert.deepEqual(
    nextSelectionOnCaseChange({ ...empty, subjectId: "Q" }, "cM1", multiLists),
    { subjectId: "M", projectId: "pM", caseId: "cM1", taskId: "" },
  );
  assert.deepEqual(
    nextSelectionOnCaseChange({ ...empty, subjectId: "P" }, "cM1", multiLists),
    { subjectId: "P", projectId: "pM", caseId: "cM1", taskId: "" },
  );
});

test("více klientů: změna klienta na dalšího klienta zachová spis", () => {
  const state = { subjectId: "M", projectId: "pM", caseId: "cM2", taskId: "tM2" };
  assert.deepEqual(nextSelectionOnSubjectChange(state, "Q", multiLists), {
    subjectId: "Q",
    projectId: "pM",
    caseId: "cM2",
    taskId: "tM2",
  });
  // Případ, kde Q klientem není, se nahradí jediným případem, kde klientem je;
  // projekt zůstane.
  const other = { subjectId: "M", projectId: "pM", caseId: "cM1", taskId: "tM1" };
  assert.deepEqual(nextSelectionOnSubjectChange(other, "Q", multiLists), {
    subjectId: "Q",
    projectId: "pM",
    caseId: "cM2",
    taskId: "",
  });
  // Klient mimo spis vynuluje vše.
  assert.deepEqual(nextSelectionOnSubjectChange(state, "O", multiLists), {
    subjectId: "O",
    projectId: "",
    caseId: "",
    taskId: "",
  });
});

test("více klientů: výběr projektu / úkolu ponechá dalšího klienta", () => {
  assert.deepEqual(
    nextSelectionOnProjectChange({ ...empty, subjectId: "P" }, "pM", multiLists),
    { subjectId: "P", projectId: "pM", caseId: "", taskId: "" },
  );
  assert.deepEqual(
    nextSelectionOnProjectChange({ ...empty, subjectId: "P" }, "pO", multiLists),
    { subjectId: "O", projectId: "pO", caseId: "", taskId: "" },
  );
  // Klient jen na cM2: případ cM1 při změně projektu nezůstane, doplní se cM2.
  assert.deepEqual(
    nextSelectionOnProjectChange(
      { subjectId: "Q", projectId: "", caseId: "cM1", taskId: "" },
      "pM",
      multiLists,
    ),
    { subjectId: "Q", projectId: "pM", caseId: "cM2", taskId: "" },
  );
  assert.deepEqual(
    nextSelectionOnTaskChange({ ...empty, subjectId: "Q" }, "tM2", multiLists),
    { subjectId: "Q", projectId: "pM", caseId: "cM2", taskId: "tM2" },
  );
  assert.deepEqual(
    nextSelectionOnTaskChange({ ...empty, subjectId: "Q" }, "tM1", multiLists),
    { subjectId: "M", projectId: "pM", caseId: "cM1", taskId: "tM1" },
  );
});

test("více klientů: klient jen na případu potřebuje případ", () => {
  assert.equal(subjectNeedsCase({ subjectId: "Q", projectId: "pM" }, multiLists), true);
  assert.equal(subjectNeedsCase({ subjectId: "P", projectId: "pM" }, multiLists), false);
  assert.equal(subjectNeedsCase({ subjectId: "M", projectId: "pM" }, multiLists), false);
  assert.equal(subjectNeedsCase({ subjectId: "Q", projectId: "" }, multiLists), false);
  assert.equal(subjectNeedsCase({ subjectId: "", projectId: "pM" }, multiLists), false);

  // Více případů klienta Q: nic se nedoplní, výběr zůstane na uživateli.
  const twoCases: MatterCascadeLists = {
    ...multiLists,
    cases: [
      ...multiCases,
      { id: "cM3", projectId: "pM", clientSubjectIds: ["Q"] },
    ],
  };
  assert.deepEqual(
    nextSelectionOnProjectChange({ ...empty, subjectId: "Q" }, "pM", twoCases),
    { subjectId: "Q", projectId: "pM", caseId: "", taskId: "" },
  );
  assert.deepEqual(
    nextSelectionOnProjectChange({ ...empty, subjectId: "Q" }, "pM", multiLists),
    { subjectId: "Q", projectId: "pM", caseId: "cM2", taskId: "" },
  );
});

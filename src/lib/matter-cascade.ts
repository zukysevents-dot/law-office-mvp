// Pure rules behind the dependent client → project → case (→ task) pickers
// (CascadingMatterSelect). Kept framework-free so they are unit-tested and the
// same behaviour applies to every form and filter that uses the component:
// choosing a client offers only that client's projects and cases, choosing a
// project only its cases, choosing a deeper level back-fills the higher ones,
// and changing a parent clears every child that no longer belongs to it.
//
// Více klientů na spisu: projekt i případ mohou kromě hlavního klienta projektu
// nést další subjekty s rolí Klient (SubjectRelation). Volitelné
// `clientSubjectIds` je seznam těchto dalších klientů — projektu (vazby na
// projekt) a případu (vazby přímo na případ; klienti projektu platí i pro jeho
// případy). Na kteréhokoli z nich lze vykázat práci. Bez `clientSubjectIds` se
// chování nemění (jediný klient = hlavní klient projektu).

export type CascadeProject = {
  id: string;
  mainSubjectId: string | null;
  clientSubjectIds?: string[];
};
export type CascadeCase = {
  id: string;
  projectId: string | null;
  clientSubjectIds?: string[];
};
export type CascadeTask = {
  id: string;
  projectId: string | null;
  caseId: string | null;
  // Uživatel je na úkolu řešitelem nebo dohledem — výběr ho řadí do skupiny
  // „Moje úkoly“ (filtrování kaskády ho nemění).
  mine?: boolean;
};

// Rozdělení úkolů pro výběr: „Moje úkoly“ (řešitel/dohled) a ostatní, každá
// skupina v původním pořadí. Bez vlastních úkolů zůstává seznam plochý
// (mine = []).
export function groupTasksByMine<T extends CascadeTask>(tasks: T[]) {
  const mine = tasks.filter((task) => task.mine);
  return {
    mine,
    others: mine.length > 0 ? tasks.filter((task) => !task.mine) : tasks,
  };
}

export type MatterCascadeState = {
  subjectId: string;
  projectId: string;
  caseId: string;
  taskId: string;
};

export type MatterCascadeLists<
  P extends CascadeProject = CascadeProject,
  C extends CascadeCase = CascadeCase,
  T extends CascadeTask = CascadeTask,
> = {
  projects: P[];
  cases: C[];
  tasks?: T[];
};

function projectSubject(
  projects: CascadeProject[],
  projectId: string | null | undefined,
): string | null {
  if (!projectId) {
    return null;
  }
  return projects.find((project) => project.id === projectId)?.mainSubjectId ?? null;
}

function caseProject(
  cases: CascadeCase[],
  caseId: string | null | undefined,
): string | null {
  if (!caseId) {
    return null;
  }
  return cases.find((legalCase) => legalCase.id === caseId)?.projectId ?? null;
}

/** Klienti projektu: hlavní klient + další klienti z vazeb na projekt. */
export function projectClientSubjectIds(
  projects: CascadeProject[],
  projectId: string | null | undefined,
): string[] {
  const project = projectId
    ? projects.find((item) => item.id === projectId)
    : undefined;
  if (!project) {
    return [];
  }
  return [
    ...(project.mainSubjectId ? [project.mainSubjectId] : []),
    ...(project.clientSubjectIds ?? []),
  ];
}

/** Klienti případu: klienti jeho projektu + další klienti z vazeb na případ. */
export function caseClientSubjectIds(
  cases: CascadeCase[],
  projects: CascadeProject[],
  caseId: string | null | undefined,
): string[] {
  const legalCase = caseId ? cases.find((item) => item.id === caseId) : undefined;
  if (!legalCase) {
    return [];
  }
  return [
    ...projectClientSubjectIds(projects, legalCase.projectId),
    ...(legalCase.clientSubjectIds ?? []),
  ];
}

function caseHasClient(
  legalCase: CascadeCase,
  projects: CascadeProject[],
  subjectId: string,
) {
  return (
    projectClientSubjectIds(projects, legalCase.projectId).includes(subjectId) ||
    (legalCase.clientSubjectIds ?? []).includes(subjectId)
  );
}

/**
 * Subjekt je klientem projektu přímo, nebo klientem některého z jeho případů
 * (pak projekt nabízíme, aby šlo dojít k případu).
 */
function projectReachesClient(
  project: CascadeProject,
  subjectId: string,
  projects: CascadeProject[],
  cases: CascadeCase[],
) {
  if (projectClientSubjectIds(projects, project.id).includes(subjectId)) {
    return true;
  }
  return cases.some(
    (legalCase) =>
      legalCase.projectId === project.id &&
      (legalCase.clientSubjectIds ?? []).includes(subjectId),
  );
}

/** The project a task effectively belongs to (its case's project wins). */
export function taskProjectId(task: CascadeTask, cases: CascadeCase[]): string | null {
  if (task.caseId) {
    return caseProject(cases, task.caseId) ?? task.projectId;
  }
  return task.projectId;
}

/** Task without any matter (no project, no case) – valid only without a matter. */
function isStandaloneTask(task: CascadeTask) {
  return !task.projectId && !task.caseId;
}

export function projectsForSubject<P extends CascadeProject>(
  projects: P[],
  subjectId: string,
  cases: CascadeCase[] = [],
): P[] {
  return subjectId
    ? projects.filter((project) =>
        projectReachesClient(project, subjectId, projects, cases),
      )
    : projects;
}

export function casesForSelection<C extends CascadeCase>(
  cases: C[],
  projects: CascadeProject[],
  selection: { subjectId: string; projectId: string },
): C[] {
  if (selection.projectId) {
    const projectCases = cases.filter(
      (legalCase) => legalCase.projectId === selection.projectId,
    );
    // Vedlejší klient případu vidí jen „své“ případy projektu. Klient, který
    // projektu vůbec nepatří (rozporný stav z URL), filtr nezužuje.
    const subjectId = selection.subjectId;
    const project = projects.find((item) => item.id === selection.projectId);
    if (
      subjectId &&
      project &&
      projectReachesClient(project, subjectId, projects, projectCases)
    ) {
      return projectCases.filter((legalCase) =>
        caseHasClient(legalCase, projects, subjectId),
      );
    }
    return projectCases;
  }
  if (selection.subjectId) {
    const subjectId = selection.subjectId;
    return cases.filter(
      (legalCase) =>
        legalCase.projectId !== null && caseHasClient(legalCase, projects, subjectId),
    );
  }
  return cases;
}

export function tasksForSelection<T extends CascadeTask>(
  tasks: T[],
  cases: CascadeCase[],
  projects: CascadeProject[],
  selection: { subjectId: string; projectId: string; caseId: string },
): T[] {
  if (selection.caseId) {
    return tasks.filter((task) => task.caseId === selection.caseId);
  }
  if (selection.projectId) {
    const projectTasks = tasks.filter(
      (task) => taskProjectId(task, cases) === selection.projectId,
    );
    // Stejně jako u případů: vedlejší klient vidí jen úkoly „svých“ případů.
    const subjectId = selection.subjectId;
    const project = projects.find((item) => item.id === selection.projectId);
    if (subjectId && project && projectReachesClient(project, subjectId, projects, cases)) {
      return projectTasks.filter((task) =>
        taskClientSubjectIds(task, cases, projects).includes(subjectId),
      );
    }
    return projectTasks;
  }
  if (selection.subjectId) {
    const subjectId = selection.subjectId;
    return tasks.filter((task) => {
      if (isStandaloneTask(task)) {
        return true;
      }
      return taskClientSubjectIds(task, cases, projects).includes(subjectId);
    });
  }
  return tasks;
}

/** Klienti, na které lze vykázat práci k úkolu (podle jeho případu/projektu). */
function taskClientSubjectIds(
  task: CascadeTask,
  cases: CascadeCase[],
  projects: CascadeProject[],
): string[] {
  if (task.caseId && cases.some((legalCase) => legalCase.id === task.caseId)) {
    return caseClientSubjectIds(cases, projects, task.caseId);
  }
  return projectClientSubjectIds(projects, taskProjectId(task, cases));
}

/**
 * Klient, který je ke spisu přidaný jen na některých případech (ne na
 * projektu), se dá vykázat jen s případem — server výkaz jen na projekt
 * odmítne. Formulář výkazu pak případ vyžaduje.
 */
export function subjectNeedsCase(
  selection: { subjectId: string; projectId: string },
  lists: Pick<MatterCascadeLists, "projects" | "cases">,
): boolean {
  const { subjectId, projectId } = selection;
  if (!subjectId || !projectId) {
    return false;
  }
  if (projectClientSubjectIds(lists.projects, projectId).includes(subjectId)) {
    return false;
  }
  return lists.cases.some(
    (legalCase) =>
      legalCase.projectId === projectId &&
      (legalCase.clientSubjectIds ?? []).includes(subjectId),
  );
}

/** Jediný případ projektu, kde je zvolený klient přidaný, se doplní sám. */
function withSingleClientCase(
  next: { subjectId: string; projectId: string; caseId: string },
  lists: MatterCascadeLists,
) {
  if (next.caseId || !subjectNeedsCase(next, lists)) {
    return next;
  }
  const clientCases = lists.cases.filter(
    (legalCase) =>
      legalCase.projectId === next.projectId &&
      (legalCase.clientSubjectIds ?? []).includes(next.subjectId),
  );
  return clientCases.length === 1 ? { ...next, caseId: clientCases[0].id } : next;
}

/** Ponechá zvoleného klienta, pokud je klientem spisu, jinak hlavní klient. */
function keepOrMainSubject(
  current: string,
  allowed: string[],
  fallback: string,
): string {
  if (current && allowed.includes(current)) {
    return current;
  }
  return allowed[0] || fallback;
}

function taskFitsSelection(
  task: CascadeTask | undefined,
  lists: MatterCascadeLists,
  selection: { subjectId: string; projectId: string; caseId: string },
) {
  if (!task) {
    return false;
  }
  return tasksForSelection([task], lists.cases, lists.projects, selection).length === 1;
}

/**
 * Initial state from (possibly partial) defaults, e.g. URL params or a record
 * being edited: deeper levels back-fill the higher ones.
 */
export function initialCascadeSelection(
  defaults: Partial<MatterCascadeState>,
  lists: MatterCascadeLists,
): MatterCascadeState {
  const caseId = defaults.caseId ?? "";
  const taskId = defaults.taskId ?? "";
  const projectId = defaults.projectId || caseProject(lists.cases, caseId) || "";
  const subjectId =
    defaults.subjectId || projectSubject(lists.projects, projectId) || "";
  return { subjectId, projectId, caseId, taskId };
}

export function nextSelectionOnSubjectChange(
  state: MatterCascadeState,
  subjectId: string,
  lists: MatterCascadeLists,
): MatterCascadeState {
  if (!subjectId) {
    return { subjectId: "", projectId: "", caseId: "", taskId: "" };
  }
  const currentProject = lists.projects.find((item) => item.id === state.projectId);
  const projectKept =
    Boolean(currentProject) &&
    projectReachesClient(currentProject!, subjectId, lists.projects, lists.cases);
  const projectId = projectKept ? state.projectId : "";
  const caseKept =
    Boolean(state.caseId) &&
    caseClientSubjectIds(lists.cases, lists.projects, state.caseId).includes(subjectId) &&
    (!projectId || caseProject(lists.cases, state.caseId) === projectId);
  const caseId = caseKept ? state.caseId : "";
  const next = withSingleClientCase({ subjectId, projectId, caseId }, lists);
  const task = lists.tasks?.find((item) => item.id === state.taskId);
  return {
    ...next,
    taskId: taskFitsSelection(task, lists, next) ? state.taskId : "",
  };
}

export function nextSelectionOnProjectChange(
  state: MatterCascadeState,
  projectId: string,
  lists: MatterCascadeLists,
): MatterCascadeState {
  const project = lists.projects.find((item) => item.id === projectId);
  // Zvolený (i vedlejší) klient zůstane, pokud k projektu patří; jinak se
  // doplní hlavní klient projektu.
  const subjectReached =
    Boolean(project) &&
    Boolean(state.subjectId) &&
    projectReachesClient(project!, state.subjectId, lists.projects, lists.cases);
  const subjectId = projectId
    ? subjectReached
      ? state.subjectId
      : projectSubject(lists.projects, projectId) || state.subjectId
    : state.subjectId;
  // Případ zůstane, jen když patří k projektu a (je-li klient vedlejším
  // klientem jen některých případů) i ke zvolenému klientovi.
  const caseInProject =
    Boolean(projectId) &&
    Boolean(state.caseId) &&
    caseProject(lists.cases, state.caseId) === projectId;
  const caseFitsSubject =
    !subjectReached ||
    caseClientSubjectIds(lists.cases, lists.projects, state.caseId).includes(subjectId);
  const caseId = caseInProject && caseFitsSubject ? state.caseId : "";
  const next = withSingleClientCase({ subjectId, projectId, caseId }, lists);
  const task = lists.tasks?.find((item) => item.id === state.taskId);
  return {
    ...next,
    taskId: taskFitsSelection(task, lists, next) ? state.taskId : "",
  };
}

export function nextSelectionOnCaseChange(
  state: MatterCascadeState,
  caseId: string,
  lists: MatterCascadeLists,
): MatterCascadeState {
  if (!caseId) {
    const next = { subjectId: state.subjectId, projectId: state.projectId, caseId: "" };
    const task = lists.tasks?.find((item) => item.id === state.taskId);
    return {
      ...next,
      taskId: taskFitsSelection(task, lists, next) ? state.taskId : "",
    };
  }
  const projectId = caseProject(lists.cases, caseId) || state.projectId;
  const subjectId = keepOrMainSubject(
    state.subjectId,
    caseClientSubjectIds(lists.cases, lists.projects, caseId),
    projectSubject(lists.projects, projectId) || state.subjectId,
  );
  const task = lists.tasks?.find((item) => item.id === state.taskId);
  return {
    subjectId,
    projectId,
    caseId,
    taskId: task && task.caseId === caseId ? state.taskId : "",
  };
}

export function nextSelectionOnTaskChange(
  state: MatterCascadeState,
  taskId: string,
  lists: MatterCascadeLists,
): MatterCascadeState {
  const task = taskId ? lists.tasks?.find((item) => item.id === taskId) : undefined;
  if (!task) {
    return { ...state, taskId };
  }
  if (isStandaloneTask(task)) {
    // A task without a matter cannot be combined with a project or a case.
    return { subjectId: state.subjectId, projectId: "", caseId: "", taskId };
  }
  const projectId = taskProjectId(task, lists.cases) ?? state.projectId;
  return {
    subjectId: keepOrMainSubject(
      state.subjectId,
      taskClientSubjectIds(task, lists.cases, lists.projects),
      projectSubject(lists.projects, projectId) || state.subjectId,
    ),
    projectId: projectId ?? "",
    caseId: task.caseId ?? "",
    taskId,
  };
}

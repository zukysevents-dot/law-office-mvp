// Pure rules behind the dependent client → project → case (→ task) pickers
// (CascadingMatterSelect). Kept framework-free so they are unit-tested and the
// same behaviour applies to every form and filter that uses the component:
// choosing a client offers only that client's projects and cases, choosing a
// project only its cases, choosing a deeper level back-fills the higher ones,
// and changing a parent clears every child that no longer belongs to it.

export type CascadeProject = { id: string; mainSubjectId: string | null };
export type CascadeCase = { id: string; projectId: string | null };
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
): P[] {
  return subjectId
    ? projects.filter((project) => project.mainSubjectId === subjectId)
    : projects;
}

export function casesForSelection<C extends CascadeCase>(
  cases: C[],
  projects: CascadeProject[],
  selection: { subjectId: string; projectId: string },
): C[] {
  if (selection.projectId) {
    return cases.filter((legalCase) => legalCase.projectId === selection.projectId);
  }
  if (selection.subjectId) {
    const subjectProjects = new Set(
      projectsForSubject(projects, selection.subjectId).map((project) => project.id),
    );
    return cases.filter(
      (legalCase) => legalCase.projectId !== null && subjectProjects.has(legalCase.projectId),
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
    return tasks.filter((task) => taskProjectId(task, cases) === selection.projectId);
  }
  if (selection.subjectId) {
    return tasks.filter((task) => {
      if (isStandaloneTask(task)) {
        return true;
      }
      return projectSubject(projects, taskProjectId(task, cases)) === selection.subjectId;
    });
  }
  return tasks;
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
  const projectKept =
    Boolean(state.projectId) &&
    projectSubject(lists.projects, state.projectId) === subjectId;
  const projectId = projectKept ? state.projectId : "";
  const caseKept =
    Boolean(state.caseId) &&
    projectSubject(lists.projects, caseProject(lists.cases, state.caseId)) === subjectId &&
    (!projectId || caseProject(lists.cases, state.caseId) === projectId);
  const caseId = caseKept ? state.caseId : "";
  const next = { subjectId, projectId, caseId };
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
  const subjectId = projectId
    ? projectSubject(lists.projects, projectId) || state.subjectId
    : state.subjectId;
  const caseId =
    projectId && state.caseId && caseProject(lists.cases, state.caseId) === projectId
      ? state.caseId
      : "";
  const next = { subjectId, projectId, caseId };
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
  const subjectId = projectSubject(lists.projects, projectId) || state.subjectId;
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
    subjectId: projectSubject(lists.projects, projectId) || state.subjectId,
    projectId: projectId ?? "",
    caseId: task.caseId ?? "",
    taskId,
  };
}

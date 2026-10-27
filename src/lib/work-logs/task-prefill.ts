// „Vykázat práci“ u úkolu — předvyplnění dialogu nového výkazu (subjekt,
// projekt, případ, úkol). Čistá funkce (unit test). Kaskáda výběru
// (initialCascadeSelection) z úkolu projekt ani subjekt nedopočítá, proto se
// posílají explicitně: projekt z případu (má přednost), subjekt z projektu.

export type TaskWorkLogSource = {
  id: string;
  projectId: string | null;
  caseId: string | null;
  project: { mainSubjectId: string | null } | null;
  case: {
    projectId: string | null;
    project: { mainSubjectId: string | null } | null;
  } | null;
};

export type TaskWorkLogPrefill = {
  subjectId: string;
  projectId: string;
  caseId: string;
  taskId: string;
};

export function buildTaskWorkLogPrefill(task: TaskWorkLogSource): TaskWorkLogPrefill {
  const caseId = task.caseId ?? "";
  const projectId = (caseId ? task.case?.projectId : null) ?? task.projectId ?? "";
  const subjectId =
    (caseId ? task.case?.project?.mainSubjectId : null) ??
    task.project?.mainSubjectId ??
    "";
  return { subjectId, projectId, caseId, taskId: task.id };
}

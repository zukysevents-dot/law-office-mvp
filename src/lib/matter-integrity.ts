export type MatterSelection = {
  subjectId?: string | null;
  projectId?: string | null;
  caseId?: string | null;
  taskId?: string | null;
};

export type MatterFacts = {
  project?: {
    id: string;
    mainSubjectId: string;
  } | null;
  legalCase?: {
    id: string;
    projectId: string;
    mainSubjectId: string;
  } | null;
  task?: {
    id: string;
    projectId: string | null;
    caseId: string | null;
    caseProjectId: string | null;
    mainSubjectId: string | null;
  } | null;
};

export type ResolvedMatterSelection = {
  subjectId: string | null;
  projectId: string | null;
  caseId: string | null;
  taskId: string | null;
};

function value(value: string | null | undefined) {
  return value || null;
}

function requireLoadedFact(
  requestedId: string | null,
  loadedId: string | null,
  label: string,
) {
  if (requestedId && requestedId !== loadedId) {
    throw new Error(`${label} nebyl načten pro kontrolu vazeb.`);
  }
}

/**
 * Resolves the denormalized subject/project/case/task columns to one coherent
 * hierarchy. Deeper records are authoritative: task -> case -> project ->
 * project's main subject. Missing parent IDs are derived; conflicting IDs are
 * rejected instead of trusting the independently submitted form fields.
 */
export function resolveMatterSelection(
  selection: MatterSelection,
  facts: MatterFacts,
): ResolvedMatterSelection {
  const requestedSubjectId = value(selection.subjectId);
  const requestedProjectId = value(selection.projectId);
  const requestedCaseId = value(selection.caseId);
  const requestedTaskId = value(selection.taskId);

  requireLoadedFact(requestedProjectId, facts.project?.id ?? null, "Projekt");
  requireLoadedFact(requestedCaseId, facts.legalCase?.id ?? null, "Případ");
  requireLoadedFact(requestedTaskId, facts.task?.id ?? null, "Úkol");

  if (
    facts.legalCase &&
    requestedProjectId &&
    facts.legalCase.projectId !== requestedProjectId
  ) {
    throw new Error("Vybraný případ nepatří k vybranému projektu.");
  }

  const taskProjectId = facts.task
    ? facts.task.caseId
      ? facts.task.caseProjectId
      : facts.task.projectId
    : null;

  if (facts.task?.caseId && !facts.task.caseProjectId) {
    throw new Error("Vybraný úkol má neplatnou vazbu na případ.");
  }

  if (
    facts.task?.caseId &&
    facts.task.projectId &&
    facts.task.caseProjectId !== facts.task.projectId
  ) {
    throw new Error("Vybraný úkol má rozpornou vazbu na projekt a případ.");
  }

  if (facts.task && requestedCaseId && facts.task.caseId !== requestedCaseId) {
    throw new Error("Vybraný úkol nepatří k vybranému případu.");
  }

  if (facts.task && requestedProjectId && taskProjectId !== requestedProjectId) {
    throw new Error("Vybraný úkol nepatří k vybranému projektu.");
  }

  const resolvedCaseId = facts.task?.caseId ?? facts.legalCase?.id ?? null;
  const resolvedProjectId =
    taskProjectId ?? facts.legalCase?.projectId ?? facts.project?.id ?? null;

  const canonicalSubjectIds = [
    facts.task?.mainSubjectId,
    facts.legalCase?.mainSubjectId,
    facts.project?.mainSubjectId,
  ].filter((id): id is string => Boolean(id));
  const canonicalSubjectId = canonicalSubjectIds[0] ?? null;

  if (canonicalSubjectIds.some((id) => id !== canonicalSubjectId)) {
    throw new Error("Vybrané vazby odkazují na různé subjekty.");
  }

  if (
    requestedSubjectId &&
    canonicalSubjectId &&
    requestedSubjectId !== canonicalSubjectId
  ) {
    throw new Error(
      "Vybraný subjekt neodpovídá klientovi vybraného projektu.",
    );
  }

  return {
    subjectId: canonicalSubjectId ?? requestedSubjectId,
    projectId: resolvedProjectId ?? requestedProjectId,
    caseId: resolvedCaseId ?? requestedCaseId,
    taskId: requestedTaskId,
  };
}

// „Duplikovat úkol“ („uložit jako“) — předvyplnění formuláře nového úkolu ze
// stávajícího úkolu. Čistá funkce (unit testy): stránka načte zdroj přes
// taskVisibilityWhere a předá, co uživatel smí vybrat (viditelné nearchivované
// projekty/případy/subjekty a aktivní členy kanceláře). Kopie je NOVÝ úkol
// založený běžnou akcí createTask — komentáře, historie ani výkazy se nekopírují,
// status je vždy „Vytvořeno“ a začátek dnešní.

export type TaskDuplicateSource = {
  title: string;
  priority: string;
  deadlineType: string;
  deadline: Date | null;
  shortDescription: string | null;
  detailedDescription: string | null;
  sharepointUrl: string | null;
  projectId: string | null;
  caseId: string | null;
  /** Projekt případu (úkol na případu nemusí mít vyplněný projectId). */
  caseProjectId: string | null;
  /** Hlavní subjekt projektu úkolu, resp. projektu případu. */
  subjectId: string | null;
  /** Řešitelé v pořadí, hlavní první. */
  assigneeIds: readonly string[];
  supervisorIds: readonly string[];
  responsibleUserId: string | null;
};

export type TaskDuplicateAllowed = {
  projectIds: ReadonlySet<string>;
  caseIds: ReadonlySet<string>;
  subjectIds: ReadonlySet<string>;
  /** Aktivní členové kanceláře (nabídka osob ve formuláři). */
  userIds: ReadonlySet<string>;
};

export type TaskDuplicatePrefill = {
  title: string;
  priority: string;
  deadlineType: string;
  /** `YYYY-MM-DD` nebo "" */
  deadline: string;
  /** `YYYY-MM-DD` — dnešek. */
  startDate: string;
  shortDescription: string;
  detailedDescription: string;
  sharepointUrl: string;
  subjectId: string;
  projectId: string;
  caseId: string;
  assigneeIds: string[];
  supervisorIds: string[];
  responsibleUserId: string;
  /** Projekt nebo případ zdroje už není k výběru (archivovaný / bez přístupu). */
  matterDropped: boolean;
  /** Některá osoba zdroje už není aktivním členem kanceláře. */
  peopleDropped: boolean;
};

function isoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function buildTaskDuplicatePrefill(
  source: TaskDuplicateSource,
  allowed: TaskDuplicateAllowed,
  todayIso: string,
): TaskDuplicatePrefill {
  // Projekt případu má přednost (úkol na případu nese projekt případu).
  const effectiveProjectId = source.caseProjectId ?? source.projectId;
  const projectOk =
    !effectiveProjectId || allowed.projectIds.has(effectiveProjectId);
  const caseOk = !source.caseId || allowed.caseIds.has(source.caseId);
  // Nedostupný projekt shodí i případ; nedostupný případ jen sebe.
  const projectId = projectOk ? effectiveProjectId ?? "" : "";
  const caseId = projectOk && caseOk ? source.caseId ?? "" : "";
  const matterDropped = !projectOk || !caseOk;
  const subjectId =
    projectId && source.subjectId && allowed.subjectIds.has(source.subjectId)
      ? source.subjectId
      : "";

  const keep = (ids: readonly string[]) =>
    [...new Set(ids)].filter((id) => allowed.userIds.has(id));
  const assigneeIds = keep(source.assigneeIds);
  const taken = new Set(assigneeIds);
  const supervisorIds = keep(source.supervisorIds).filter((id) => !taken.has(id));
  const responsibleUserId =
    source.responsibleUserId && allowed.userIds.has(source.responsibleUserId)
      ? source.responsibleUserId
      : "";
  const peopleDropped = [
    ...source.assigneeIds,
    ...source.supervisorIds,
    ...(source.responsibleUserId ? [source.responsibleUserId] : []),
  ].some((id) => !allowed.userIds.has(id));

  return {
    title: source.title,
    priority: source.priority,
    deadlineType: source.deadlineType,
    deadline: isoDate(source.deadline),
    startDate: todayIso,
    shortDescription: source.shortDescription ?? "",
    detailedDescription: source.detailedDescription ?? "",
    sharepointUrl: source.sharepointUrl ?? "",
    subjectId,
    projectId,
    caseId,
    assigneeIds,
    supervisorIds,
    responsibleUserId,
    matterDropped,
    peopleDropped,
  };
}

// Více klientů na spisu. Hlavním klientem je vždy Project.mainSubjectId; další
// klienty lze ke spisu přidat jako SubjectRelation s rolí Klient — buď na
// projekt (platí pro projekt i všechny jeho případy), nebo přímo na případ.
// Na kteréhokoli z nich lze vykázat práci a vystavit fakturu.

export type ClientRelationRow = {
  subjectId: string;
  projectId: string | null;
  caseId: string | null;
};

export type MatterClientMaps = {
  /** Další klienti z vazeb na projekt (bez vazeb na jeho případy). */
  byProject: Map<string, string[]>;
  /** Další klienti z vazeb přímo na případ. */
  byCase: Map<string, string[]>;
};

function push(map: Map<string, string[]>, key: string, subjectId: string) {
  const list = map.get(key);
  if (!list) {
    map.set(key, [subjectId]);
  } else if (!list.includes(subjectId)) {
    list.push(subjectId);
  }
}

/** Seskupí vazby s rolí Klient podle projektu a případu (bez duplicit). */
export function groupClientRelations(rows: ClientRelationRow[]): MatterClientMaps {
  const byProject = new Map<string, string[]>();
  const byCase = new Map<string, string[]>();
  for (const row of rows) {
    if (row.caseId) {
      push(byCase, row.caseId, row.subjectId);
    } else if (row.projectId) {
      push(byProject, row.projectId, row.subjectId);
    }
  }
  return { byProject, byCase };
}

/**
 * Další klienti (mimo hlavního) pro projekt, případně jeho případ: klienti
 * projektu platí i pro případ, klienti případu jen pro něj. Hlavní klient se
 * vynechá a pořadí odpovídá pořadí vazeb.
 */
export function additionalClientsForMatter(
  maps: MatterClientMaps,
  matter: {
    projectId: string | null;
    caseId: string | null;
    mainSubjectId: string | null;
  },
): string[] {
  const ids = [
    ...(matter.projectId ? (maps.byProject.get(matter.projectId) ?? []) : []),
    ...(matter.caseId ? (maps.byCase.get(matter.caseId) ?? []) : []),
  ];
  return [...new Set(ids)].filter((id) => id !== matter.mainSubjectId);
}

// Pure builder for the "Spisy" document tree (Projekt → Případ → dokumenty,
// plus documents attached directly to a subject, plus unfiled). No DB / Prisma
// import — structurally typed and unit-testable. The page supplies already
// visibility-gated projects/cases/documents; this only shapes the hierarchy.

export type TreeDocument = {
  id: string;
  name: string;
  kind: string;
  caseId: string | null;
  subjectId: string | null;
  subjectName: string | null;
  version: number;
};

export type TreeProjectInput = { id: string; name: string };
export type TreeCaseInput = { id: string; name: string; projectId: string };

export type DocNode = {
  id: string;
  name: string;
  kind: string;
  version: number;
};

export type CaseNode = { id: string; name: string; documents: DocNode[] };
export type ProjectNode = {
  id: string;
  name: string;
  cases: CaseNode[];
  docCount: number;
};
export type SubjectNode = { id: string; name: string; documents: DocNode[] };

export type DocumentTree = {
  projects: ProjectNode[];
  subjects: SubjectNode[];
  unfiled: DocNode[];
  totalDocuments: number;
};

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "cs");

function toDocNode(doc: TreeDocument): DocNode {
  return { id: doc.id, name: doc.name, kind: doc.kind, version: doc.version };
}

/**
 * Assemble the document tree. Documents are placed under their case (grouped by
 * project); a document with only a (visible) subject goes under that subject;
 * one with neither (or whose case/subject is not in the visible set) lands in
 * "unfiled" so it is never silently dropped. All projects/cases are listed even
 * when empty, so the tree reflects the full matter workspace, not just folders
 * that have files.
 *
 * `visibleSubjectIds` strictly gates the subject grouping to subjectVisibilityWhere:
 * a document the user can see only because they authored it (createdById) must
 * not reveal the NAME of an otherwise-invisible subject — such a document drops
 * to "unfiled" instead. Omit the set to allow all subjects (used by unit tests).
 */
export function buildDocumentTree(
  projects: TreeProjectInput[],
  cases: TreeCaseInput[],
  documents: TreeDocument[],
  visibleSubjectIds?: Set<string>,
): DocumentTree {
  const docsByCase = new Map<string, DocNode[]>();
  const docsBySubject = new Map<string, { name: string; documents: DocNode[] }>();
  const unfiled: DocNode[] = [];
  const knownCaseIds = new Set(cases.map((c) => c.id));
  const subjectVisible = (id: string) =>
    visibleSubjectIds === undefined || visibleSubjectIds.has(id);

  for (const doc of documents) {
    if (doc.caseId && knownCaseIds.has(doc.caseId)) {
      const list = docsByCase.get(doc.caseId) ?? [];
      list.push(toDocNode(doc));
      docsByCase.set(doc.caseId, list);
    } else if (doc.subjectId && subjectVisible(doc.subjectId)) {
      const group = docsBySubject.get(doc.subjectId) ?? {
        name: doc.subjectName ?? "Neznámý subjekt",
        documents: [],
      };
      group.documents.push(toDocNode(doc));
      docsBySubject.set(doc.subjectId, group);
    } else {
      // No visible case and no visible subject → unfiled (subject name hidden).
      unfiled.push(toDocNode(doc));
    }
  }

  const casesByProject = new Map<string, TreeCaseInput[]>();
  for (const legalCase of cases) {
    const list = casesByProject.get(legalCase.projectId) ?? [];
    list.push(legalCase);
    casesByProject.set(legalCase.projectId, list);
  }

  const projectNodes: ProjectNode[] = projects
    .map((project) => {
      const caseNodes: CaseNode[] = (casesByProject.get(project.id) ?? [])
        .map((legalCase) => ({
          id: legalCase.id,
          name: legalCase.name,
          documents: (docsByCase.get(legalCase.id) ?? []).sort(byName),
        }))
        .sort(byName);
      const docCount = caseNodes.reduce(
        (sum, node) => sum + node.documents.length,
        0,
      );
      return { id: project.id, name: project.name, cases: caseNodes, docCount };
    })
    .sort(byName);

  const subjectNodes: SubjectNode[] = [...docsBySubject.entries()]
    .map(([id, group]) => ({
      id,
      name: group.name,
      documents: group.documents.sort(byName),
    }))
    .sort(byName);

  return {
    projects: projectNodes,
    subjects: subjectNodes,
    unfiled: unfiled.sort(byName),
    totalDocuments: documents.length,
  };
}

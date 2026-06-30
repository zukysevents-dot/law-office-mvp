import { FolderOpen, FolderTree } from "lucide-react";
import Link from "next/link";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  buildDocumentTree,
  type DocNode,
  type DocumentTree,
} from "@/lib/document-tree";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate } from "@/lib/format";
import { documentKindLabels } from "@/lib/labels";
import {
  andWhere,
  caseVisibilityWhere,
  documentVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { documentKindTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const listInclude = {
  case: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  currentVersion: { select: { version: true } },
} satisfies Prisma.DocumentInclude;

type Row = Prisma.DocumentGetPayload<{ include: typeof listInclude }>;

// Hard caps on how many documents either view loads. When a result hits the cap
// the UI shows a "refine your search" notice so nothing silently vanishes.
const FLAT_LIMIT = 500;
const TREE_DOC_LIMIT = 2000;

type Data = { documents: Row[]; tree: DocumentTree | null; truncated: boolean };

const emptyTree: DocumentTree = {
  projects: [],
  subjects: [],
  unfiled: [],
  totalDocuments: 0,
};
const emptyData: Data = { documents: [], tree: null, truncated: false };

function kindLabel(kind: string): string {
  return documentKindLabels[kind as DocumentKind] ?? kind;
}

// One document leaf — clickable link + kind badge + version. Shared by the
// case / subject / unfiled branches of the tree.
function DocLeaf({ document }: { document: DocNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <Link
        href={`/documents/${document.id}`}
        className="font-medium text-[#072924] underline-offset-2 hover:underline"
      >
        {document.name}
      </Link>
      <Badge tone={documentKindTone(document.kind as DocumentKind)}>
        {kindLabel(document.kind)}
      </Badge>
      <span className="text-xs text-stone-400">v{document.version}</span>
    </li>
  );
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { q, kind } = await searchParams;
  const search = q?.trim() || "";
  const kindFilter =
    kind && kind in DocumentKind ? (kind as DocumentKind) : undefined;
  // A search / kind filter switches to a flat result list; the default view is
  // the matter tree ("Spisy").
  const isFiltered = Boolean(search || kindFilter);

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
    const prisma = getPrisma();

    if (isFiltered) {
      const documents = await prisma.document.findMany({
        where: andWhere(
          documentVisibilityWhere(currentUser),
          { archivedAt: null },
          kindFilter ? { kind: kindFilter } : undefined,
          search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { description: { contains: search, mode: "insensitive" } },
                ],
              }
            : undefined,
        ),
        include: listInclude,
        orderBy: { createdAt: "desc" },
        take: FLAT_LIMIT,
      });
      return { documents, tree: null, truncated: documents.length >= FLAT_LIMIT };
    }

    // Tree view: visibility-gated projects, cases and documents assembled into
    // the Projekt → Případ → dokument hierarchy by the pure builder. Subjects are
    // loaded separately so the subject grouping is strictly limited to
    // subjectVisibilityWhere (a doc visible only via createdById must not reveal
    // an otherwise-invisible subject's name).
    const [projects, cases, documents, visibleSubjects] = await Promise.all([
      prisma.project.findMany({
        where: andWhere(projectVisibilityWhere(currentUser), {
          archivedAt: null,
        }),
        select: { id: true, name: true },
      }),
      prisma.case.findMany({
        where: andWhere(caseVisibilityWhere(currentUser), { archivedAt: null }),
        select: { id: true, name: true, projectId: true },
      }),
      prisma.document.findMany({
        where: andWhere(documentVisibilityWhere(currentUser), {
          archivedAt: null,
        }),
        select: {
          id: true,
          name: true,
          kind: true,
          caseId: true,
          subjectId: true,
          subject: { select: { name: true } },
          currentVersion: { select: { version: true } },
        },
        orderBy: { name: "asc" },
        take: TREE_DOC_LIMIT,
      }),
      prisma.subject.findMany({
        where: andWhere(subjectVisibilityWhere(currentUser), {
          archivedAt: null,
        }),
        select: { id: true },
      }),
    ]);

    const tree = buildDocumentTree(
      projects,
      cases,
      documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        kind: doc.kind,
        caseId: doc.caseId,
        subjectId: doc.subjectId,
        subjectName: doc.subject?.name ?? null,
        version: doc.currentVersion?.version ?? 1,
      })),
      new Set(visibleSubjects.map((subject) => subject.id)),
    );
    return {
      documents: [],
      tree,
      truncated: documents.length >= TREE_DOC_LIMIT,
    };
  });

  const data = result.data ?? emptyData;
  const tree = data.tree ?? emptyTree;
  const truncationLimit = isFiltered ? FLAT_LIMIT : TREE_DOC_LIMIT;

  return (
    <>
      <PageHeader
        title="Spisy"
        description="Spisy a dokumenty (odkazy do SharePointu) uspořádané podle projektů a případů."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Hledání">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Hledat (název, popis)">
            <TextInput name="q" defaultValue={search} placeholder="Hledat…" />
          </Field>
          <Field label="Typ">
            <SelectInput name="kind" defaultValue={kindFilter ?? ""}>
              <option value="">Všechny</option>
              {Object.values(DocumentKind).map((value) => (
                <option key={value} value={value}>
                  {documentKindLabels[value]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" variant="secondary">
            Hledat
          </Button>
          {isFiltered ? (
            <ButtonLink href="/documents" variant="ghost">
              Zrušit filtr
            </ButtonLink>
          ) : null}
        </form>
      </Section>

      {data.truncated ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Zobrazeno prvních {truncationLimit} dokumentů. Pro nalezení dalších
          upřesněte hledání.
        </p>
      ) : null}

      {isFiltered ? (
        <Section title="Výsledky hledání">
          {data.documents.length > 0 ? (
            <div className="table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Název</th>
                    <th>Typ</th>
                    <th>Spis / subjekt</th>
                    <th>Verze</th>
                    <th>Vytvořeno</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.map((document) => (
                    <tr key={document.id}>
                      <td className="font-medium text-stone-950">
                        <Link
                          href={`/documents/${document.id}`}
                          className="text-[#072924] underline-offset-2 hover:underline"
                        >
                          {document.name}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={documentKindTone(document.kind)}>
                          {documentKindLabels[document.kind]}
                        </Badge>
                      </td>
                      <td>
                        {document.case ? (
                          <Link
                            href={`/cases/${document.case.id}`}
                            className="text-[#072924] underline-offset-2 hover:underline"
                          >
                            {document.case.name}
                          </Link>
                        ) : document.subject ? (
                          <Link
                            href={`/subjects/${document.subject.id}`}
                            className="text-[#072924] underline-offset-2 hover:underline"
                          >
                            {document.subject.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>v{document.currentVersion?.version ?? 1}</td>
                      <td>{formatDate(document.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Žádné dokumenty neodpovídají filtru.</EmptyState>
          )}
        </Section>
      ) : (
        <Section title={`Strom spisů (${tree.totalDocuments} dokumentů)`}>
          {tree.projects.length === 0 &&
          tree.subjects.length === 0 &&
          tree.unfiled.length === 0 ? (
            <EmptyState>Zatím nejsou založené žádné projekty ani dokumenty.</EmptyState>
          ) : (
            <div className="space-y-2">
              {tree.projects.map((project) => (
                <details
                  key={project.id}
                  className="rounded-lg border border-[#d4e2dc] bg-white px-4 py-3"
                >
                  <summary className="flex cursor-pointer items-center gap-2 font-medium text-[#072924]">
                    <FolderTree className="h-4 w-4" aria-hidden="true" />
                    {project.name}
                    <span className="text-xs font-normal text-stone-400">
                      {project.docCount} dok.
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1 pl-6">
                    {project.cases.length > 0 ? (
                      project.cases.map((legalCase) => (
                        <details key={legalCase.id} className="py-1">
                          <summary className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                            <FolderOpen
                              className="h-4 w-4 text-stone-400"
                              aria-hidden="true"
                            />
                            <Link
                              href={`/cases/${legalCase.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {legalCase.name}
                            </Link>
                            <span className="text-xs text-stone-400">
                              {legalCase.documents.length} dok.
                            </span>
                          </summary>
                          {legalCase.documents.length > 0 ? (
                            <ul className="mt-1 pl-6">
                              {legalCase.documents.map((document) => (
                                <DocLeaf key={document.id} document={document} />
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 pl-6 text-xs text-stone-400">
                              Žádné dokumenty.
                            </p>
                          )}
                        </details>
                      ))
                    ) : (
                      <p className="text-xs text-stone-400">Žádné případy.</p>
                    )}
                  </div>
                </details>
              ))}

              {tree.subjects.length > 0 ? (
                <details className="rounded-lg border border-[#d4e2dc] bg-white px-4 py-3">
                  <summary className="cursor-pointer font-medium text-[#072924]">
                    Dokumenty u subjektů (bez případu)
                  </summary>
                  <div className="mt-2 space-y-1 pl-6">
                    {tree.subjects.map((subject) => (
                      <details key={subject.id} className="py-1">
                        <summary className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                          <Link
                            href={`/subjects/${subject.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {subject.name}
                          </Link>
                          <span className="text-xs text-stone-400">
                            {subject.documents.length} dok.
                          </span>
                        </summary>
                        <ul className="mt-1 pl-6">
                          {subject.documents.map((document) => (
                            <DocLeaf key={document.id} document={document} />
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}

              {tree.unfiled.length > 0 ? (
                <details className="rounded-lg border border-[#d4e2dc] bg-white px-4 py-3">
                  <summary className="cursor-pointer font-medium text-[#072924]">
                    Nezařazené dokumenty
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      {tree.unfiled.length} dok.
                    </span>
                  </summary>
                  <ul className="mt-2 pl-6">
                    {tree.unfiled.map((document) => (
                      <DocLeaf key={document.id} document={document} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

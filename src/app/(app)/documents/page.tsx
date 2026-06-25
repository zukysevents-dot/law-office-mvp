import Link from "next/link";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate } from "@/lib/format";
import { documentKindLabels } from "@/lib/labels";
import { andWhere, documentVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { documentKindTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const listInclude = {
  case: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  currentVersion: { select: { version: true } },
} satisfies Prisma.DocumentInclude;

type Row = Prisma.DocumentGetPayload<{ include: typeof listInclude }>;

type Data = { documents: Row[] };

const emptyData: Data = { documents: [] };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { q, kind } = await searchParams;
  const search = q?.trim() || "";
  const kindFilter =
    kind && kind in DocumentKind ? (kind as DocumentKind) : undefined;

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    const documents = await getPrisma().document.findMany({
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
      take: 500,
    });

    return { documents };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Dokumenty"
        description="Evidence dokumentů (odkazy do SharePointu) napříč spisy a subjekty."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Filtr">
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
            Filtrovat
          </Button>
        </form>
      </Section>

      <Section title="Seznam dokumentů">
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
    </>
  );
}

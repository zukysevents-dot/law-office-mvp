import { AlertTriangle, Search } from "lucide-react";

import { ConflictCheckSaveForm } from "@/components/conflict-check-save-form";
import { TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { subjectRoleLabels, subjectTypeLabels } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";
import { subjectRoleTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type ConflictCheckProps = {
  searchParams: Promise<{ q?: string }>;
};

type ConflictSubject = {
  id: string;
  name: string;
  ico: string | null;
  type: keyof typeof subjectTypeLabels;
  riskFlag: boolean;
  relations: Array<{
    id: string;
    relationType: string;
    role: keyof typeof subjectRoleLabels;
    note: string | null;
    createdAt: Date;
    project: { name: string } | null;
    case: { name: string; fileNumber: string | null } | null;
  }>;
};

function conflictRoleLabel(role: keyof typeof subjectRoleLabels) {
  if (role === "CLIENT") {
    return "Klient";
  }

  if (role === "COUNTERPARTY") {
    return "Protistrana";
  }

  return "Jiná role";
}

export default async function ConflictCheckPage({
  searchParams,
}: ConflictCheckProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const result = await safeQuery<{ subjects: ConflictSubject[] }>(
    { subjects: [] },
    async () => {
      if (!query) {
        return { subjects: [] };
      }

      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const subjects = await prisma.subject.findMany({
        // Conflict check is firm-wide by design — scope to the org (tenant
        // isolation), not to personal visibility.
        where: {
          organizationId: currentUser.organizationId,
          archivedAt: null,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { ico: { contains: query, mode: "insensitive" } },
          ],
        },
        include: {
          relations: {
            orderBy: { createdAt: "desc" },
            include: {
              project: { select: { name: true } },
              case: { select: { name: true, fileNumber: true } },
            },
          },
        },
        orderBy: { name: "asc" },
        take: LIST_QUERY_LIMIT,
      });

      return { subjects };
    },
  );

  return (
    <>
      <PageHeader
        title="Conflict check"
        description="Prověření existujících subjektů, jejich rolí a historických vazeb."
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400"
              aria-hidden="true"
            />
            <TextInput
              name="q"
              defaultValue={query}
              placeholder="Název subjektu nebo IČO"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Prověřit
          </Button>
        </form>
      </Section>
      <Section title="Výsledek prověření">
        {!query ? (
          <EmptyState>Zadejte název subjektu nebo IČO.</EmptyState>
        ) : result.data.subjects.length > 0 ? (
          <div className="grid gap-4">
            {result.data.subjects.map((subject) => {
              const counterpartyRelations = subject.relations.filter(
                (relation) => relation.role === "COUNTERPARTY",
              );
              const wasCounterparty = counterpartyRelations.length > 0;
              const hasWarning = subject.riskFlag || wasCounterparty;

              return (
                <article
                  key={subject.id}
                  className="rounded-md border border-stone-200 bg-stone-50 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-stone-950">
                          {subject.name}
                        </h2>
                        <Badge>{subjectTypeLabels[subject.type]}</Badge>
                        {subject.ico ? <Badge>IČO {subject.ico}</Badge> : null}
                        {hasWarning ? (
                          <Badge tone="red">
                            <AlertTriangle
                              className="mr-1 h-3 w-3"
                              aria-hidden="true"
                            />
                            Upozornění
                          </Badge>
                        ) : (
                          <Badge tone="green">Bez zjevného konfliktu</Badge>
                        )}
                      </div>
                      <div className="mt-2 grid gap-1 text-sm">
                        {wasCounterparty ? (
                          <p className="font-medium text-red-900">
                            Subjekt byl v minulosti veden jako protistrana.
                          </p>
                        ) : null}
                        {subject.riskFlag ? (
                          <p className="font-medium text-red-900">
                            Subjekt je označen jako rizikový.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <ConflictCheckSaveForm
                      searchedQuery={query}
                      subjectId={subject.id}
                      buttonLabel="Uložit check"
                      className="grid gap-2"
                      buttonClassName="w-full"
                    />
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Konfliktní role</th>
                          <th>Projekt</th>
                          <th>Případ</th>
                          <th>Spisová značka</th>
                          <th>Poznámka</th>
                          <th>Datum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subject.relations.length > 0 ? (
                          subject.relations.map((relation) => (
                            <tr key={relation.id}>
                              <td>
                                <Badge
                                  tone={subjectRoleTone(relation.role)}
                                >
                                  {subjectRoleLabels[relation.role]}
                                </Badge>
                              </td>
                              <td>{conflictRoleLabel(relation.role)}</td>
                              <td>{relation.project?.name ?? "—"}</td>
                              <td>{relation.case?.name ?? "—"}</td>
                              <td>{relation.case?.fileNumber ?? "—"}</td>
                              <td>{relation.note ?? "—"}</td>
                              <td>
                                {formatDate(relation.createdAt)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7}>Bez historických vazeb.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-4">
            <EmptyState>Nebyl nalezen žádný existující subjekt.</EmptyState>
            <ConflictCheckSaveForm
              searchedQuery={query}
              noteControl="input"
              buttonLabel="Uložit bez nálezu"
              className="grid gap-3 md:grid-cols-[1fr_auto]"
              buttonClassName="self-end"
            />
          </div>
        )}
      </Section>
    </>
  );
}

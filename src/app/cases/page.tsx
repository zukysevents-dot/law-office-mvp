import Link from "next/link";
import { Plus } from "lucide-react";

import { createCase } from "@/app/actions/cases";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  archiveFilterLabels,
  archivedWhere,
  archiveFilterValue,
} from "@/lib/archive-filter";
import { safeQuery } from "@/lib/db-safe";
import { formatDate } from "@/lib/format";
import { caseStatusLabels, options } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import {
  getCurrentTableView,
  getDefaultTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type CasesPageProps = {
  searchParams: Promise<{ archive?: string }>;
};

type CasesPageData = {
  cases: Array<{
    id: string;
    name: string;
    fileNumber: string | null;
    status: keyof typeof caseStatusLabels;
    sharepointUrl: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    project: { id: string; name: string };
    responsibleUser: { name: string } | null;
  }>;
  projects: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  tableView: TableViewState;
};

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const params = await searchParams;
  const archive = archiveFilterValue(params.archive);
  const result = await safeQuery<CasesPageData>(
    {
      cases: [],
      projects: [],
      users: [],
      tableView: getDefaultTableView("cases"),
    },
    async () => {
      const prisma = getPrisma();
      const tableView = await getCurrentTableView("cases");
      const [cases, projects, users] = await Promise.all([
        prisma.case.findMany({
          where: archivedWhere(archive),
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { id: true, name: true } },
            responsibleUser: { select: { name: true } },
          },
        }),
        prisma.project.findMany({
          where: { archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      return { cases, projects, users, tableView };
    },
  );
  const visibleColumnSet = new Set(result.data.tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Případy"
        description="Případy jsou vedené pod projekty a mohou nést vlastní spisovou značku."
        action={
          <ButtonLink href="#new-case">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nový případ
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="grid gap-3 md:grid-cols-[220px_auto]">
          <Field label="Archiv">
            <SelectInput name="archive" defaultValue={archive}>
              {Object.entries(archiveFilterLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            Filtrovat
          </Button>
        </form>
      </Section>
      <Section title="Seznam případů">
        <ColumnVisibilityPanel
          tableKey="cases"
          columns={result.data.tableView.columns}
          visibleColumns={result.data.tableView.visibleColumns}
        />
        {result.data.cases.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  {result.data.tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.cases.map((legalCase) => (
                  <tr key={legalCase.id}>
                    {visibleColumnSet.has("name") ? (
                      <td className="max-w-xs">
                        <Link
                          href={`/cases/${legalCase.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {legalCase.name}
                        </Link>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("project") ? (
                      <td>
                        <Link
                          href={`/projects/${legalCase.project.id}`}
                          className="text-emerald-950 hover:underline"
                        >
                          {legalCase.project.name}
                        </Link>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("fileNumber") ? (
                      <td>{legalCase.fileNumber ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("responsibleUser") ? (
                      <td>{legalCase.responsibleUser?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("status") ? (
                      <td>
                        <Badge tone="green">
                          {caseStatusLabels[legalCase.status]}
                        </Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("sharePointUrl") ? (
                      <td className="max-w-xs truncate">
                        {legalCase.sharepointUrl ?? "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("note") ? (
                      <td className="max-w-md">{legalCase.note ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("createdAt") ? (
                      <td>{formatDate(legalCase.createdAt)}</td>
                    ) : null}
                    {visibleColumnSet.has("updatedAt") ? (
                      <td>{formatDate(legalCase.updatedAt)}</td>
                    ) : null}
                    <td>
                      <ButtonLink
                        href={`/cases/${legalCase.id}`}
                        variant="ghost"
                        className="h-8 px-3"
                      >
                        Detail
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nejsou založené žádné případy.</EmptyState>
        )}
      </Section>
      <Section title="Nový případ" id="new-case" className="scroll-mt-6">
        <form action={createCase} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Projekt">
              <SelectInput name="projectId" required>
                <option value="">Vyberte projekt</option>
                {result.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Název případu">
              <TextInput name="name" required />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Spisová značka">
              <TextInput name="fileNumber" />
            </Field>
            <Field label="Odpovědný uživatel">
              <SelectInput name="responsibleUserId">
                <option value="">Bez přiřazení</option>
                {result.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Stav">
              <SelectInput name="status" defaultValue="ACTIVE">
                {options.caseStatuses.map((status) => (
                  <option key={status} value={status}>
                    {caseStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field label="SharePoint URL">
            <TextInput name="sharepointUrl" type="url" />
          </Field>
          <Field label="Poznámka">
            <TextArea name="note" />
          </Field>
          <div>
            <Button type="submit">Vytvořit případ</Button>
          </div>
        </form>
      </Section>
    </>
  );
}

import Link from "next/link";
import { Plus } from "lucide-react";

import { createProject } from "@/app/actions/projects";
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
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatMoney } from "@/lib/format";
import { options, projectStatusLabels } from "@/lib/labels";
import {
  andWhere,
  canViewRates,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  getCurrentTableView,
  getDefaultTableView,
  restrictTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: Promise<{ archive?: string; subjectId?: string }>;
};

type ProjectPageData = {
  projects: Array<{
    id: string;
    name: string;
    status: keyof typeof projectStatusLabels;
    hourlyRate: unknown;
    sharepointUrl: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    mainSubject: { name: string };
    responsibleUser: { name: string } | null;
  }>;
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  users: Array<{ id: string; name: string }>;
  tableView: TableViewState;
  canViewRates: boolean;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const archive = archiveFilterValue(params.archive);
  const subjectId = params.subjectId ?? "";
  const result = await safeQuery<ProjectPageData>(
    {
      projects: [],
      subjects: [],
      users: [],
      tableView: getDefaultTableView("projects"),
      canViewRates: false,
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("projects");
      const [projects, subjects, users] = await Promise.all([
        prisma.project.findMany({
          where: andWhere(
            archivedWhere(archive),
            projectVisibilityWhere(currentUser),
            subjectId ? { mainSubjectId: subjectId } : {},
          ),
          orderBy: { createdAt: "desc" },
          include: {
            mainSubject: { select: { name: true } },
            responsibleUser: { select: { name: true } },
          },
        }),
        prisma.subject.findMany({
          where: andWhere(
            { archivedAt: null },
            subjectVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true, ico: true },
        }),
        prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      return {
        projects,
        subjects,
        users,
        tableView,
        canViewRates: canViewRates(currentUser),
      };
    },
  );
  // Strip the rate column for roles that may not see pricing.
  const tableView = result.data.canViewRates
    ? result.data.tableView
    : restrictTableView(result.data.tableView, ["hourlyRate"]);
  const visibleColumnSet = new Set(tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Projekty"
        description="Projekt drží hlavní subjekt, odpovědnou osobu a hodinovou sazbu pro navazující výkazy práce."
        action={
          <ButtonLink href="#new-project">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nový projekt
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Klient">
            <SelectInput name="subjectId" defaultValue={subjectId}>
              <option value="">Všichni klienti</option>
              {result.data.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </SelectInput>
          </Field>
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
      <Section title="Seznam projektů">
        <ColumnVisibilityPanel
          tableKey="projects"
          columns={tableView.columns}
          visibleColumns={tableView.visibleColumns}
        />
        {result.data.projects.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  {tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.projects.map((project) => (
                  <tr key={project.id}>
                    {/* Pořadí buněk MUSÍ odpovídat pořadí sloupců v configu
                        (table-view-preferences: Klient první, pak Název), jinak
                        hlavička nesedí na obsah — „Klient" nad názvem projektu. */}
                    {visibleColumnSet.has("mainSubject") ? (
                      <td>{project.mainSubject.name}</td>
                    ) : null}
                    {visibleColumnSet.has("name") ? (
                      <td className="max-w-xs">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {project.name}
                        </Link>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("responsibleUser") ? (
                      <td>{project.responsibleUser?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("status") ? (
                      <td>
                        <Badge tone="green">{projectStatusLabels[project.status]}</Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("hourlyRate") ? (
                      <td>{formatMoney(project.hourlyRate as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("sharePointUrl") ? (
                      <td className="max-w-xs truncate">
                        {project.sharepointUrl ?? "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("note") ? (
                      <td className="max-w-md">{project.note ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("createdAt") ? (
                      <td>{formatDate(project.createdAt)}</td>
                    ) : null}
                    {visibleColumnSet.has("updatedAt") ? (
                      <td>{formatDate(project.updatedAt)}</td>
                    ) : null}
                    <td>
                      <ButtonLink
                        href={`/projects/${project.id}`}
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
          <EmptyState>Zatím nejsou založené žádné projekty.</EmptyState>
        )}
      </Section>
      <Section title="Nový projekt" id="new-project" className="scroll-mt-6">
        <form action={createProject} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Název projektu">
              <TextInput name="name" required />
            </Field>
            <Field label="Stav">
              <SelectInput name="status" defaultValue="ACTIVE">
                {options.projectStatuses.map((status) => (
                  <option key={status} value={status}>
                    {projectStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Klient">
              <SelectInput name="mainSubjectId" required>
                <option value="">Vyberte subjekt</option>
                {result.data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.ico ? `, IČO ${subject.ico}` : ""}
                  </option>
                ))}
              </SelectInput>
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
          </div>
          <Field label="Hodinová sazba projektu">
            <TextInput name="hourlyRate" type="number" min="0" step="0.01" />
          </Field>
          <Field label="SharePoint URL">
            <TextInput name="sharepointUrl" type="url" />
          </Field>
          <Field label="Poznámka">
            <TextArea name="note" />
          </Field>
          <div>
            <Button type="submit">Vytvořit projekt</Button>
          </div>
        </form>
      </Section>
    </>
  );
}

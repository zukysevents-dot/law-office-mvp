import { notFound } from "next/navigation";

import { updateProject } from "@/app/actions/projects";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { numberInputValue } from "@/lib/form-values";
import { options, projectStatusLabels } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canEditRecord,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";

export const dynamic = "force-dynamic";

type ProjectEditProps = {
  params: Promise<{ id: string }>;
};

async function loadProjectEdit(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const [project, subjects, users] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.subject.findMany({
      where: andWhere(
        { archivedAt: null },
        subjectVisibilityWhere(currentUser),
      ),
      orderBy: { name: "asc" },
      take: LIST_QUERY_LIMIT,
      select: { id: true, name: true, ico: true },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        memberships: { some: { organizationId: currentUser.organizationId } },
      },
      orderBy: { name: "asc" },
      take: LIST_QUERY_LIMIT,
      select: { id: true, name: true },
    }),
  ]);

  return {
    project:
      project && canEditRecord(currentUser, "Project", project) ? project : null,
    subjects,
    users,
  };
}

type ProjectEditData = Awaited<ReturnType<typeof loadProjectEdit>>;

const emptyProjectEdit: ProjectEditData = {
  project: null,
  subjects: [],
  users: [],
};

export default async function ProjectEditPage({ params }: ProjectEditProps) {
  const { id } = await params;
  const result = await safeQuery<ProjectEditData>(
    emptyProjectEdit,
    () => loadProjectEdit(id),
  );

  if (result.databaseReady && !result.data.project) {
    notFound();
  }

  const { project, subjects, users } = result.data;

  return (
    <>
      <PageHeader
        title="Upravit projekt"
        description="Úprava základního projektového nastavení."
        action={
          <ButtonLink href={`/projects/${id}`} variant="secondary">
            Zpět na detail
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {project ? (
        <Section>
          <form action={updateProject} className="grid gap-4">
            <input type="hidden" name="id" value={project.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Název projektu">
                <TextInput name="name" defaultValue={project.name} required />
              </Field>
              <Field label="Stav">
                <SelectInput name="status" defaultValue={project.status}>
                  {options.projectStatuses.map((status) => (
                    <option key={status} value={status}>
                      {projectStatusLabels[status]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Hlavní subjekt">
                <SelectInput
                  name="mainSubjectId"
                  defaultValue={project.mainSubjectId}
                  required
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                      {subject.ico ? `, IČO ${subject.ico}` : ""}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Odpovědný uživatel">
                <SelectInput
                  name="responsibleUserId"
                  defaultValue={project.responsibleUserId ?? ""}
                >
                  <option value="">Bez přiřazení</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Hodinová sazba">
              <TextInput
                name="hourlyRate"
                type="number"
                min="0"
                step="0.01"
                defaultValue={numberInputValue(project.hourlyRate)}
              />
            </Field>
            <Field label="SharePoint URL">
              <TextInput
                name="sharepointUrl"
                type="url"
                defaultValue={project.sharepointUrl ?? ""}
              />
            </Field>
            <Field label="Poznámka">
              <TextArea name="note" defaultValue={project.note ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit projekt</Button>
              <ButtonLink href={`/projects/${project.id}`} variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace projektu není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}

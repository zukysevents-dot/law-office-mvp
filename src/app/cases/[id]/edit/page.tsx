import { notFound } from "next/navigation";

import { updateCase } from "@/app/actions/cases";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { caseStatusLabels, options } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CaseEditProps = {
  params: Promise<{ id: string }>;
};

async function loadCaseEdit(id: string) {
  const prisma = getPrisma();
  const [legalCase, projects, users] = await Promise.all([
    prisma.case.findUnique({ where: { id } }),
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

  return { legalCase, projects, users };
}

type CaseEditData = Awaited<ReturnType<typeof loadCaseEdit>>;

const emptyCaseEdit: CaseEditData = {
  legalCase: null,
  projects: [],
  users: [],
};

export default async function CaseEditPage({ params }: CaseEditProps) {
  const { id } = await params;
  const result = await safeQuery<CaseEditData>(
    emptyCaseEdit,
    () => loadCaseEdit(id),
  );

  if (result.databaseReady && !result.data.legalCase) {
    notFound();
  }

  const { legalCase, projects, users } = result.data;

  return (
    <>
      <PageHeader
        title="Upravit případ"
        description="Úprava případového kontextu a spisové značky."
        action={
          <ButtonLink href={`/cases/${id}`} variant="secondary">
            Zpět na detail
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {legalCase ? (
        <Section>
          <form action={updateCase} className="grid gap-4">
            <input type="hidden" name="id" value={legalCase.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Projekt">
                <SelectInput
                  name="projectId"
                  defaultValue={legalCase.projectId}
                  required
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Název případu">
                <TextInput name="name" defaultValue={legalCase.name} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Spisová značka">
                <TextInput
                  name="fileNumber"
                  defaultValue={legalCase.fileNumber ?? ""}
                />
              </Field>
              <Field label="Odpovědný uživatel">
                <SelectInput
                  name="responsibleUserId"
                  defaultValue={legalCase.responsibleUserId ?? ""}
                >
                  <option value="">Bez přiřazení</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Stav">
                <SelectInput name="status" defaultValue={legalCase.status}>
                  {options.caseStatuses.map((status) => (
                    <option key={status} value={status}>
                      {caseStatusLabels[status]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="SharePoint URL">
              <TextInput
                name="sharepointUrl"
                type="url"
                defaultValue={legalCase.sharepointUrl ?? ""}
              />
            </Field>
            <Field label="Poznámka">
              <TextArea name="note" defaultValue={legalCase.note ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit případ</Button>
              <ButtonLink href={`/cases/${legalCase.id}`} variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace případu není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}

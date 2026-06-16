import { notFound } from "next/navigation";

import {
  archiveReference,
  restoreReference,
  updateReference,
} from "@/app/actions/references";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { dateInputValue, numberInputValue } from "@/lib/form-values";
import { legalAreaOptions } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ReferenceEditProps = {
  params: Promise<{ id: string }>;
};

async function loadReferenceEdit(id: string) {
  const prisma = getPrisma();
  const [reference, projects, cases, subjects] = await Promise.all([
    prisma.reference.findUnique({ where: { id } }),
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.case.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, project: { select: { name: true } } },
    }),
    prisma.subject.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ico: true },
    }),
  ]);

  return { reference, projects, cases, subjects };
}

type ReferenceEditData = Awaited<ReturnType<typeof loadReferenceEdit>>;

const emptyReferenceEdit: ReferenceEditData = {
  reference: null,
  projects: [],
  cases: [],
  subjects: [],
};

export default async function ReferenceEditPage({ params }: ReferenceEditProps) {
  const { id } = await params;
  const result = await safeQuery<ReferenceEditData>(
    emptyReferenceEdit,
    () => loadReferenceEdit(id),
  );

  if (result.databaseReady && !result.data.reference) {
    notFound();
  }

  const { reference, projects, cases, subjects } = result.data;

  return (
    <>
      <PageHeader
        title="Upravit referenci"
        description="Úprava reference pro nabídky, veřejné zakázky a obchodní použití."
        action={
          <>
            {reference ? (
              <ArchiveActionForm
                action={
                  reference.archivedAt ? restoreReference : archiveReference
                }
                id={reference.id}
                mode={reference.archivedAt ? "restore" : "archive"}
              />
            ) : null}
            <ButtonLink href="/references" variant="secondary">
              Zpět na reference
            </ButtonLink>
          </>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <ArchiveNotice archivedAt={reference?.archivedAt ?? null} />
      {reference ? (
        <Section>
          <form action={updateReference} className="grid gap-4">
            <input type="hidden" name="id" value={reference.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Název">
                <TextInput name="title" defaultValue={reference.title} required />
              </Field>
              <Field label="Právní oblast">
                <SelectInput
                  name="legalArea"
                  defaultValue={reference.legalArea ?? ""}
                >
                  <option value="">Vyberte oblast</option>
                  {legalAreaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Subjekt">
                <SelectInput name="subjectId" defaultValue={reference.subjectId ?? ""}>
                  <option value="">Bez subjektu</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                      {subject.ico ? `, IČO ${subject.ico}` : ""}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Projekt">
                <SelectInput name="projectId" defaultValue={reference.projectId ?? ""}>
                  <option value="">Bez projektu</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Případ">
                <SelectInput name="caseId" defaultValue={reference.caseId ?? ""}>
                  <option value="">Bez případu</option>
                  {cases.map((legalCase) => (
                    <option key={legalCase.id} value={legalCase.id}>
                      {legalCase.name} / {legalCase.project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Hodnota v Kč">
                <TextInput
                  name="valueCzk"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(reference.valueCzk)}
                />
              </Field>
              <Field label="Start date">
                <TextInput
                  name="startDate"
                  type="date"
                  defaultValue={dateInputValue(reference.startDate)}
                />
              </Field>
              <Field label="End date">
                <TextInput
                  name="endDate"
                  type="date"
                  defaultValue={dateInputValue(reference.endDate)}
                />
              </Field>
            </div>
            <Field label="Popis">
              <TextArea name="description" defaultValue={reference.description ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit referenci</Button>
              <ButtonLink href="/references" variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace reference není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}

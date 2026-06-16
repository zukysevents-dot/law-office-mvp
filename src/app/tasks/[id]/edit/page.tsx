import { notFound } from "next/navigation";

import { updateTask } from "@/app/actions/tasks";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { dateInputValue } from "@/lib/form-values";
import {
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TaskEditProps = {
  params: Promise<{ id: string }>;
};

async function loadTaskEdit(id: string) {
  const prisma = getPrisma();
  const [task, projects, cases, users] = await Promise.all([
    prisma.task.findUnique({ where: { id } }),
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.case.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fileNumber: true,
        project: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { task, projects, cases, users };
}

type TaskEditData = Awaited<ReturnType<typeof loadTaskEdit>>;

const emptyTaskEdit: TaskEditData = {
  task: null,
  projects: [],
  cases: [],
  users: [],
};

export default async function TaskEditPage({ params }: TaskEditProps) {
  const { id } = await params;
  const result = await safeQuery<TaskEditData>(
    emptyTaskEdit,
    () => loadTaskEdit(id),
  );

  if (result.databaseReady && !result.data.task) {
    notFound();
  }

  const { task, projects, cases, users } = result.data;

  return (
    <>
      <PageHeader
        title="Upravit úkol"
        description="Úprava zadání, odpovědností, workflow a termínů úkolu."
        action={
          <ButtonLink href={`/tasks/${id}`} variant="secondary">
            Zpět na detail
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {task ? (
        <Section>
          <form action={updateTask} className="grid gap-4">
            <input type="hidden" name="id" value={task.id} />
            <Field label="Název">
              <TextInput name="title" defaultValue={task.title} required />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Projekt">
                <SelectInput name="projectId" defaultValue={task.projectId ?? ""}>
                  <option value="">Bez projektu</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Případ">
                <SelectInput name="caseId" defaultValue={task.caseId ?? ""}>
                  <option value="">Bez případu</option>
                  {cases.map((legalCase) => (
                    <option key={legalCase.id} value={legalCase.id}>
                      {legalCase.name}
                      {legalCase.fileNumber ? `, ${legalCase.fileNumber}` : ""}
                      {legalCase.project ? ` / ${legalCase.project.name}` : ""}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Řešitel">
                <SelectInput name="assignedToId" defaultValue={task.assignedToId ?? ""}>
                  <option value="">Bez řešitele</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Odpovědná osoba">
                <SelectInput
                  name="responsibleUserId"
                  defaultValue={task.responsibleUserId ?? ""}
                >
                  <option value="">Bez odpovědné osoby</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Status">
                <SelectInput name="status" defaultValue={task.status}>
                  {options.taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {taskStatusLabels[status]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Priorita">
                <SelectInput name="priority" defaultValue={task.priority}>
                  {options.taskPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {taskPriorityLabels[priority]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Typ deadline">
                <SelectInput name="deadlineType" defaultValue={task.deadlineType}>
                  {options.taskDeadlineTypes.map((deadlineType) => (
                    <option key={deadlineType} value={deadlineType}>
                      {taskDeadlineTypeLabels[deadlineType]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Start date">
                <TextInput
                  name="startDate"
                  type="date"
                  defaultValue={dateInputValue(task.startDate)}
                />
              </Field>
              <Field label="Deadline">
                <TextInput
                  name="deadline"
                  type="date"
                  defaultValue={dateInputValue(task.deadline)}
                />
              </Field>
            </div>
            <Field label="SharePoint URL">
              <TextInput
                name="sharepointUrl"
                type="url"
                defaultValue={task.sharepointUrl ?? ""}
              />
            </Field>
            <Field label="Krátký popis">
              <TextArea
                name="shortDescription"
                defaultValue={task.shortDescription ?? ""}
              />
            </Field>
            <Field label="Detailní popis">
              <TextArea
                name="detailedDescription"
                defaultValue={task.detailedDescription ?? ""}
                className="min-h-36"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit úkol</Button>
              <ButtonLink href={`/tasks/${task.id}`} variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace úkolu není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}

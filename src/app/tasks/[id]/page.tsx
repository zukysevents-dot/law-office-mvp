import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, Save } from "lucide-react";

import {
  addTaskComment,
  archiveTask,
  restoreTask,
  updateTaskStatus,
} from "@/app/actions/tasks";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { Field, SelectInput, TextArea } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canArchiveRecords,
  canEditRecord,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  taskDeadlineTypeTone,
  taskStatusTone,
} from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type TaskDetailProps = {
  params: Promise<{ id: string }>;
};

async function loadTask(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const task = await prisma.task.findFirst({
    where: andWhere({ id }, taskVisibilityWhere(currentUser)),
    include: {
      project: {
        select: {
          id: true,
          name: true,
          mainSubject: { select: { id: true, name: true } },
        },
      },
      case: {
        select: {
          id: true,
          name: true,
          fileNumber: true,
          project: {
            select: {
              id: true,
              name: true,
              mainSubject: { select: { id: true, name: true } },
            },
          },
        },
      },
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      responsibleUser: { select: { name: true } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  return {
    task,
    canArchive: canArchiveRecords(currentUser),
    canEdit: task ? canEditRecord(currentUser, "Task", task) : false,
  };
}

type TaskDetailData = Awaited<ReturnType<typeof loadTask>>;

const emptyTaskDetail: TaskDetailData = {
  task: null,
  canArchive: false,
  canEdit: false,
};

export default async function TaskDetailPage({ params }: TaskDetailProps) {
  const { id } = await params;
  const result = await safeQuery<TaskDetailData>(emptyTaskDetail, () => loadTask(id));

  if (result.databaseReady && !result.data.task) {
    notFound();
  }

  const { task, canArchive, canEdit } = result.data;
  const subject = task?.project?.mainSubject ?? task?.case?.project.mainSubject ?? null;

  return (
    <>
      <PageHeader
        title={task?.title ?? "Detail úkolu"}
        description="Detail workflow, odpovědnosti, lhůt, komentářů a historie změn."
        action={
          <>
            {task ? (
              <>
                {canEdit ? (
                  <ButtonLink href={`/tasks/${task.id}/edit`}>
                    Upravit úkol
                  </ButtonLink>
                ) : null}
                {canArchive ? (
                  <ArchiveActionForm
                    action={task.archivedAt ? restoreTask : archiveTask}
                    id={task.id}
                    mode={task.archivedAt ? "restore" : "archive"}
                  />
                ) : null}
              </>
            ) : null}
            <ButtonLink href="/tasks" variant="secondary">
              Zpět na úkoly
            </ButtonLink>
          </>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <ArchiveNotice archivedAt={task?.archivedAt ?? null} />
      {task ? (
        <>
          <Section>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Klient / subjekt
                </p>
                {subject ? (
                  <Link
                    href={`/subjects/${subject.id}`}
                    className="font-medium text-emerald-950 hover:underline"
                  >
                    {subject.name}
                  </Link>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Projekt
                </p>
                {task.project ? (
                  <Link
                    href={`/projects/${task.project.id}`}
                    className="font-medium text-emerald-950 hover:underline"
                  >
                    {task.project.name}
                  </Link>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Případ
                </p>
                {task.case ? (
                  <Link
                    href={`/cases/${task.case.id}`}
                    className="font-medium text-emerald-950 hover:underline"
                  >
                    {task.case.name}
                    {task.case.fileNumber ? `, ${task.case.fileNumber}` : ""}
                  </Link>
                ) : (
                  <p>—</p>
                )}
              </div>
              <Info label="Vytvořil" value={task.createdBy?.name} />
              <Info label="Řešitel" value={task.assignedTo?.name} />
              <Info label="Odpovědná osoba" value={task.responsibleUser?.name} />
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Status
                </p>
                <Badge tone={taskStatusTone(task.status)}>
                  {taskStatusLabels[task.status]}
                </Badge>
              </div>
              <Info label="Priorita" value={taskPriorityLabels[task.priority]} />
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Typ deadline
                </p>
                <Badge tone={taskDeadlineTypeTone(task.deadlineType)}>
                  {taskDeadlineTypeLabels[task.deadlineType]}
                </Badge>
              </div>
              <Info label="Deadline" value={formatDate(task.deadline)} />
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  SharePoint URL
                </p>
                <p className="break-all">{task.sharepointUrl ?? "—"}</p>
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Krátký popis
                </p>
                <p>{task.shortDescription ?? "—"}</p>
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Detailní popis
                </p>
                <p className="whitespace-pre-wrap">{task.detailedDescription ?? "—"}</p>
              </div>
            </div>
          </Section>
          {canEdit ? (
            <Section title="Změnit status">
              <form action={updateTaskStatus} className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
                <input type="hidden" name="taskId" value={task.id} />
                <Field label="Nový status">
                  <SelectInput name="status" defaultValue={task.status}>
                    {options.taskStatuses.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabels[status]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Komentář ke změně">
                  <TextArea name="note" className="min-h-10" />
                </Field>
                <Button type="submit" variant="secondary" className="self-end">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Uložit status
                </Button>
              </form>
            </Section>
          ) : null}
          <Section title="Historie změn statusu">
            {task.statusHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Změnil</th>
                      <th>Původní status</th>
                      <th>Nový status</th>
                      <th>Komentář</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.statusHistory.map((history) => (
                      <tr key={history.id}>
                        <td>{formatDate(history.createdAt)}</td>
                        <td>{history.changedBy?.name ?? "—"}</td>
                        <td>
                          <Badge tone={taskStatusTone(history.oldStatus)}>
                            {taskStatusLabels[history.oldStatus]}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={taskStatusTone(history.newStatus)}>
                            {taskStatusLabels[history.newStatus]}
                          </Badge>
                        </td>
                        <td>{history.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Úkol zatím nemá historii změn statusu.</EmptyState>
            )}
          </Section>
          <Section title="Komentáře">
            {canEdit ? (
              <form action={addTaskComment} className="mb-4 grid gap-3">
                <input type="hidden" name="taskId" value={task.id} />
                <Field label="Nový komentář">
                  <TextArea name="comment" required />
                </Field>
                <div>
                  <Button type="submit">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Přidat komentář
                  </Button>
                </div>
              </form>
            ) : null}
            {task.comments.length > 0 ? (
              <div className="grid gap-3">
                {task.comments.map((comment) => (
                  <article
                    key={comment.id}
                    className="rounded-md border border-[#d4e2dc] bg-[#EEF5F1] p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <p className="font-medium text-[#072924]">
                        {comment.author?.name ?? "Neznámý autor"}
                      </p>
                      <p className="text-stone-500">{formatDate(comment.createdAt)}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {comment.comment}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>Úkol zatím nemá komentáře.</EmptyState>
            )}
          </Section>
        </>
      ) : (
        <EmptyState>Detail úkolu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
      <p>{value ?? "—"}</p>
    </div>
  );
}

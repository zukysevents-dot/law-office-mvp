import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, Copy, MessageSquare, Save } from "lucide-react";

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
import { TaskPostponeDialog } from "@/components/task-postpone-dialog";
import { TaskTimeline } from "@/components/task-timeline";
import { TaskWorkLogDialog } from "@/components/task-work-log-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatDateUtc, formatHours } from "@/lib/format";
import { firstParam, type SearchParamValue } from "@/lib/search-params";
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
  canWorkOnTask,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import {
  formatAssigneeNames,
  taskPeopleFromRecord,
  taskPeopleSelect,
} from "@/lib/tasks/task-people";
import {
  deadlineIso,
  summarizeDeadlineHistory,
} from "@/lib/tasks/deadline-history";
import { buildTaskTimeline } from "@/lib/tasks/timeline";

import { getPrisma } from "@/lib/prisma";
import {
  isTaskOverdue,
  taskDeadlineTypeTone,
  taskStatusTone,
} from "@/lib/status-tones";
import { AccessDenied } from "@/components/access-denied";
import {
  canAccessModule,
  moduleAccessDenial,
} from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type TaskDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
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
      responsibleUser: { select: { name: true } },
      // Řešitelé + dohled (obsahuje i userId/role pro kontroly práv).
      ...taskPeopleSelect,
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      // Historie úkolu: odložení / změny termínu a duplikace.
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          oldDeadline: true,
          newDeadline: true,
          reason: true,
          viaEdit: true,
          createdAt: true,
          actor: { select: { name: true } },
          relatedTask: { select: { id: true, title: true } },
        },
      },
      duplicatedFrom: { select: { id: true, title: true } },
      workLogs: {
        where: andWhere(
          { archivedAt: null },
          workLogVisibilityWhere(currentUser),
        ),
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          workDate: true,
          hours: true,
          description: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  // Související úkoly (duplikace) se odkazují jen tehdy, když je divák vidí;
  // jinak se nezobrazí ani jejich název.
  const relatedIds = task
    ? [
        ...new Set(
          [
            task.duplicatedFrom?.id,
            ...task.events.map((event) => event.relatedTask?.id),
          ].filter((value): value is string => Boolean(value)),
        ),
      ]
    : [];
  const visibleRelated =
    relatedIds.length > 0
      ? await prisma.task.findMany({
          where: andWhere(
            { id: { in: relatedIds } },
            taskVisibilityWhere(currentUser),
          ),
          select: { id: true },
        })
      : [];

  const canLogWork = task
    ? await canAccessModule(currentUser, "module.workLogs")
    : false;
  return {
    task,
    people: task ? taskPeopleFromRecord(task) : { assignees: [], supervisors: [] },
    canArchive: canArchiveRecords(currentUser),
    canEdit: task ? canEditRecord(currentUser, "Task", task) : false,
    // Status a komentáře: kdo smí upravovat, a navíc dohled.
    canWork: task ? canWorkOnTask(currentUser, task) : false,
    canLogWork,
    visibleRelatedIds: visibleRelated.map((item) => item.id),
  };
}

type TaskDetailData = Awaited<ReturnType<typeof loadTask>>;

const emptyTaskDetail: TaskDetailData = {
  task: null,
  people: { assignees: [], supervisors: [] },
  canArchive: false,
  canEdit: false,
  canWork: false,
  canLogWork: false,
  visibleRelatedIds: [],
};

export default async function TaskDetailPage({
  params,
  searchParams,
}: TaskDetailProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.tasks");
  if (accessDenied) {
    return <AccessDenied title="Úkoly" message={accessDenied} />;
  }

  const { id } = await params;
  const query = await searchParams;
  const logWork = Boolean(firstParam(query, "logWork"));
  const result = await safeQuery<TaskDetailData>(emptyTaskDetail, () =>
    loadTask(id),
  );

  if (result.databaseReady && !result.data.task) {
    notFound();
  }

  const {
    task,
    people,
    canArchive,
    canEdit,
    canWork,
    canLogWork,
    visibleRelatedIds,
  } = result.data;
  const subject = task?.project?.mainSubject ?? task?.case?.project.mainSubject ?? null;
  const now = new Date();
  const visibleRelated = new Set(visibleRelatedIds);
  const deadlineHistory = summarizeDeadlineHistory(task?.events ?? []);
  const canPostpone = Boolean(
    task &&
      canEdit &&
      task.deadline &&
      !task.archivedAt &&
      task.status !== "COMPLETED",
  );
  const logWorkHref = task ? `/tasks/${task.id}?logWork=1` : "";

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
                {canPostpone && task.deadline ? (
                  <TaskPostponeDialog
                    task={{
                      id: task.id,
                      title: task.title,
                      deadlineIso: deadlineIso(task.deadline),
                      deadlineLabel: formatDateUtc(task.deadline),
                      overdue: isTaskOverdue(task.deadline, task.status, now),
                    }}
                  />
                ) : null}
                {canLogWork ? (
                  <ButtonLink href={logWorkHref} variant="secondary">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    Vykázat práci
                  </ButtonLink>
                ) : null}
                <ButtonLink href={`/tasks/new?duplicate=${task.id}`} variant="secondary">
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Duplikovat
                </ButtonLink>
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
              <Info label="Zadavatel" value={task.createdBy?.name} />
              <Info
                label="Řešitelé"
                value={
                  people.assignees.length > 0
                    ? formatAssigneeNames(people.assignees)
                    : null
                }
              />
              <Info
                label="Dohled"
                value={
                  people.supervisors.length > 0
                    ? people.supervisors.map((person) => person.name).join(", ")
                    : null
                }
              />
              <Info label="Odpovědná osoba" value={task.responsibleUser?.name} />
              <p className="text-xs text-stone-500 md:col-span-2 md:self-end">
                Dohled: vidí úkol, komentuje, mění status a dostává upozornění.
              </p>
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
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Deadline
                </p>
                <p
                  className={
                    isTaskOverdue(task.deadline, task.status, now)
                      ? "font-semibold text-red-700"
                      : undefined
                  }
                >
                  {formatDateUtc(task.deadline)}
                </p>
                {deadlineHistory.changed ? (
                  <p className="text-xs text-stone-600" data-testid="deadline-history">
                    Původní termín: {formatDateUtc(deadlineHistory.originalDeadline)}
                    {deadlineHistory.postponeCount > 0
                      ? ` · odloženo ${deadlineHistory.postponeCount}×`
                      : ""}
                  </p>
                ) : null}
              </div>
              <Info
                label="Založeno"
                value={`${formatDate(task.createdAt)}${
                  task.createdBy ? ` (${task.createdBy.name})` : ""
                }`}
              />
              {task.duplicatedFromTaskId ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Vytvořeno duplikací z
                  </p>
                  {task.duplicatedFrom && visibleRelated.has(task.duplicatedFrom.id) ? (
                    <Link
                      href={`/tasks/${task.duplicatedFrom.id}`}
                      className="font-medium text-emerald-950 hover:underline"
                    >
                      {task.duplicatedFrom.title}
                    </Link>
                  ) : (
                    <p>úkolu, ke kterému nemáte přístup</p>
                  )}
                </div>
              ) : null}
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
          {canWork ? (
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
                <Button
                  type="submit"
                  variant="secondary"
                  className="self-end"
                  pendingLabel="Ukládám…"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Uložit status
                </Button>
              </form>
            </Section>
          ) : null}
          <Section title="Výkazy práce k úkolu">
            {canLogWork ? (
              <div className="mb-4">
                <ButtonLink href={logWorkHref} variant="ghost">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  Vykázat práci k úkolu
                </ButtonLink>
              </div>
            ) : null}
            {task.workLogs.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full table-auto">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Pracovník</th>
                      <th>Hodiny</th>
                      <th>Popis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.workLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateUtc(log.workDate)}</td>
                        <td>{log.user?.name ?? "—"}</td>
                        <td>{formatHours(log.hours)}</td>
                        <td className="max-w-md">{log.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Úkol zatím nemá výkazy práce.</EmptyState>
            )}
          </Section>
          <Section title="Historie změn statusu">
            {task.statusHistory.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full table-auto">
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
          <Section title="Komentáře a historie">
            {canWork ? (
              <form action={addTaskComment} className="mb-4 grid gap-3">
                <input type="hidden" name="taskId" value={task.id} />
                <Field label="Nový komentář">
                  <TextArea name="comment" required />
                </Field>
                <div>
                  <Button type="submit" pendingLabel="Přidávám…">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Přidat komentář
                  </Button>
                </div>
              </form>
            ) : null}
            <TaskTimeline
              items={buildTaskTimeline(task.comments, task.events)}
              visibleTaskIds={visibleRelated}
            />
          </Section>
          {canLogWork && logWork ? (
            <TaskWorkLogDialog taskId={task.id} closeHref={`/tasks/${task.id}`} />
          ) : null}
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


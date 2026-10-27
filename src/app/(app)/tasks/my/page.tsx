import Link from "next/link";
import { Save } from "lucide-react";

import { updateTaskStatus } from "@/app/actions/tasks";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RowClickNav } from "@/components/row-click-nav";
import { Section } from "@/components/section";
import { TaskStatusLegend } from "@/components/task-status-legend";
import { TaskWorkLogDialog } from "@/components/task-work-log-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateUtc } from "@/lib/format";
import {
  myTaskRoleFilterLabels,
  myTaskRoleLabels,
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import {
  andWhere,
  canWorkOnTask,
  taskVisibilityWhere,
} from "@/lib/permissions";
import {
  MY_TASK_ROLES,
  formatAssigneeNames,
  myTaskRoleWhere,
  myTaskRoles,
  parseMyTaskRole,
  taskPeopleFromRecord,
  taskPeopleSelect,
  type MyTaskRole,
} from "@/lib/tasks/task-people";
import { getPrisma } from "@/lib/prisma";
import { hrefWithout } from "@/lib/search-params";
import {
  isTaskOverdue,
  taskDeadlineTypeTone,
  taskStatusRowClass,
  taskStatusTone,
} from "@/lib/status-tones";
import { AccessDenied } from "@/components/access-denied";
import {
  canAccessModule,
  moduleAccessDenial,
} from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type MyTasksProps = {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    deadlineType?: string;
    overdue?: string;
    sort?: string;
    role?: string;
    logWork?: string;
  }>;
};

type MyTasksData = {
  userName: string;
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    deadlineType: TaskDeadlineType;
    deadline: Date | null;
    project: { name: string } | null;
    case: { name: string; fileNumber: string | null } | null;
    createdBy: { name: string } | null;
    responsibleUser: { name: string } | null;
    assigneeNames: string;
    myRoles: MyTaskRole[];
    canWork: boolean;
    postponeCount: number;
  }>;
  canLogWork: boolean;
};

const sortLabels = {
  deadline: "Deadline",
  title: "Název",
  priority: "Priorita",
  status: "Status",
};

function validEnum<T extends Record<string, string>>(source: T, value?: string) {
  return value && Object.values(source).includes(value) ? value : "";
}

function taskOrderBy(sort: string) {
  if (sort === "title") {
    return [{ title: "asc" as const }, { deadline: "asc" as const }];
  }
  if (sort === "priority") {
    return [{ priority: "desc" as const }, { deadline: "asc" as const }];
  }
  if (sort === "status") {
    return [{ status: "asc" as const }, { deadline: "asc" as const }];
  }
  return [
    { completedAt: "desc" as const },
    { deadline: "asc" as const },
    { createdAt: "desc" as const },
  ];
}

export default async function MyTasksPage({ searchParams }: MyTasksProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.tasks");
  if (accessDenied) {
    return <AccessDenied title="Moje úkoly" message={accessDenied} />;
  }

  const params = await searchParams;
  const status = validEnum(TaskStatus, params.status);
  const priority = validEnum(TaskPriority, params.priority);
  const deadlineType = validEnum(TaskDeadlineType, params.deadlineType);
  const overdueOnly = params.overdue === "1" || params.overdue === "true";
  const sort = params.sort ?? "deadline";
  const role = parseMyTaskRole(params.role);
  const logWorkTaskId =
    params.logWork && /^[A-Za-z0-9_-]{1,64}$/.test(params.logWork)
      ? params.logWork
      : "";
  const now = new Date();

  const result = await safeQuery<MyTasksData>(
    { userName: "Aktuální uživatel", tasks: [], canLogWork: false },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tasks = await prisma.task.findMany({
        where: andWhere(
          {
            organizationId: currentUser.organizationId,
            archivedAt: null,
          },
          taskVisibilityWhere(currentUser),
          // Řešitel (hlavní i další), dohled, odpovědná osoba nebo zadavatel;
          // filtr „Moje role“ zúží na jednu z nich.
          myTaskRoleWhere(currentUser.id, role),
          status ? { status: status as TaskStatus } : undefined,
          priority ? { priority: priority as TaskPriority } : undefined,
          deadlineType
            ? { deadlineType: deadlineType as TaskDeadlineType }
            : undefined,
          overdueOnly
            ? {
                deadline: { lt: now },
                status: { not: TaskStatus.COMPLETED },
              }
            : undefined,
        ),
        orderBy: taskOrderBy(sort),
        include: {
          project: { select: { name: true } },
          case: { select: { name: true, fileNumber: true } },
          createdBy: { select: { name: true } },
          responsibleUser: { select: { name: true } },
          ...taskPeopleSelect,
          _count: {
            select: { events: { where: { type: "DEADLINE_POSTPONED" } } },
          },
        },
        take: 500,
      });
      const canLogWork = await canAccessModule(currentUser, "module.workLogs");

      return {
        userName: currentUser.name,
        tasks: tasks.map(({ _count, ...task }) => ({
          ...task,
          assigneeNames: formatAssigneeNames(taskPeopleFromRecord(task).assignees),
          myRoles: myTaskRoles(task, currentUser.id),
          canWork: canWorkOnTask(currentUser, task),
          postponeCount: _count.events,
        })),
        canLogWork,
      };
    },
  );

  const listHref = hrefWithout("/tasks/my", params, ["logWork"]);
  const logWorkHref = (taskId: string) =>
    hrefWithout("/tasks/my", params, ["logWork"], { logWork: taskId });
  const hasFilters =
    Boolean(status || priority || deadlineType || overdueOnly || role) ||
    sort !== "deadline";

  return (
    <>
      <PageHeader
        title="Moje úkoly"
        description={`Úkoly, kde je ${result.data.userName} řešitel, dohled, odpovědná osoba nebo zadavatel.`}
        action={
          <ButtonLink href="/tasks" variant="secondary">
            Všechny úkoly
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Filtry a řazení">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <Field label="Moje role">
            <SelectInput name="role" defaultValue={role}>
              <option value="">Všechny role</option>
              {MY_TASK_ROLES.map((item) => (
                <option key={item} value={item}>
                  {myTaskRoleFilterLabels[item]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput name="status" defaultValue={status}>
              <option value="">Všechny statusy</option>
              {options.taskStatuses.map((item) => (
                <option key={item} value={item}>
                  {taskStatusLabels[item]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Priorita">
            <SelectInput name="priority" defaultValue={priority}>
              <option value="">Všechny priority</option>
              {options.taskPriorities.map((item) => (
                <option key={item} value={item}>
                  {taskPriorityLabels[item]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Typ lhůty">
            <SelectInput name="deadlineType" defaultValue={deadlineType}>
              <option value="">Všechny lhůty</option>
              {options.taskDeadlineTypes.map((item) => (
                <option key={item} value={item}>
                  {taskDeadlineTypeLabels[item]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Termín">
            <SelectInput name="overdue" defaultValue={overdueOnly ? "1" : ""}>
              <option value="">Všechny termíny</option>
              <option value="1">Pouze po termínu</option>
            </SelectInput>
          </Field>
          <Field label="Řazení">
            <SelectInput name="sort" defaultValue={sort}>
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            Použít
          </Button>
          {hasFilters ? (
            <ButtonLink href="/tasks/my" variant="ghost">
              Zrušit filtry
            </ButtonLink>
          ) : null}
        </form>
      </Section>
      <Section title="Moje úkoly">
        <TaskStatusLegend />
        {result.data.tasks.length > 0 ? (
          <RowClickNav>
            <div className="table-scroll">
              <table className="w-max min-w-full table-auto [&_td]:align-top">
                <thead>
                  <tr>
                    <th>Název</th>
                    <th>Projekt</th>
                    <th>Případ</th>
                    <th>Moje role</th>
                    <th>Zadavatel</th>
                    <th>Řešitelé</th>
                    <th>Odpovědná osoba</th>
                    <th>Priorita</th>
                    <th>Typ lhůty</th>
                    <th>Deadline</th>
                    <th>Status</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.tasks.map((task) => (
                    <tr
                      key={task.id}
                      data-href={`/tasks/${task.id}`}
                      tabIndex={0}
                      aria-label={`Otevřít úkol ${task.title}`}
                      className={`${taskStatusRowClass(task.status)} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-900`}
                    >
                      <td>
                        <Link
                          href={`/tasks/${task.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td>{task.project?.name ?? "—"}</td>
                      <td>
                        {task.case
                          ? `${task.case.name}${
                              task.case.fileNumber
                                ? `, ${task.case.fileNumber}`
                                : ""
                            }`
                          : "—"}
                      </td>
                      <td>
                        <div className="flex min-w-36 flex-wrap gap-1">
                          {task.myRoles.map((item) => (
                            <Badge
                              key={item}
                              tone={item === "supervisor" ? "blue" : item === "assignee" ? "mint" : "neutral"}
                              className="whitespace-nowrap"
                            >
                              {myTaskRoleLabels[item]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>{task.createdBy?.name ?? "—"}</td>
                      <td>{task.assigneeNames || "—"}</td>
                      <td>{task.responsibleUser?.name ?? "—"}</td>
                      <td>{taskPriorityLabels[task.priority]}</td>
                      <td>
                        <Badge tone={taskDeadlineTypeTone(task.deadlineType)}>
                          {taskDeadlineTypeLabels[task.deadlineType]}
                        </Badge>
                      </td>
                      <td
                        className={
                          isTaskOverdue(task.deadline, task.status, now)
                            ? "font-semibold text-red-700"
                            : undefined
                        }
                      >
                        {formatDateUtc(task.deadline)}
                        {task.postponeCount > 0 ? (
                          <Badge tone="amber" className="ml-2 whitespace-nowrap">
                            odloženo {task.postponeCount}×
                          </Badge>
                        ) : null}
                      </td>
                      <td className="min-w-72">
                        {task.canWork ? (
                          <form action={updateTaskStatus} className="grid gap-2">
                            <input type="hidden" name="taskId" value={task.id} />
                            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                              <SelectInput name="status" defaultValue={task.status}>
                                {options.taskStatuses.map((item) => (
                                  <option key={item} value={item}>
                                    {taskStatusLabels[item]}
                                  </option>
                                ))}
                              </SelectInput>
                              <Button
                                type="submit"
                                variant="secondary"
                                className="h-10 px-3"
                              >
                                <Save className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">Uložit status</span>
                              </Button>
                            </div>
                            <TextInput
                              name="note"
                              placeholder="Komentář ke změně statusu"
                            />
                          </form>
                        ) : null}
                        <Badge
                          tone={taskStatusTone(task.status)}
                          className={task.canWork ? "mt-2" : undefined}
                        >
                          {taskStatusLabels[task.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {result.data.canLogWork ? (
                            <ButtonLink
                              href={logWorkHref(task.id)}
                              variant="ghost"
                              className="h-8 whitespace-nowrap px-3"
                              title="Vykázat práci k úkolu"
                            >
                              Vykázat práci
                            </ButtonLink>
                          ) : null}
                          <ButtonLink
                            href={`/tasks/new?duplicate=${task.id}`}
                            variant="ghost"
                            className="h-8 px-3"
                            title="Duplikovat úkol (uložit jako nový)"
                          >
                            Duplikovat
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RowClickNav>
        ) : (
          <EmptyState>Žádné úkoly neodpovídají filtrům.</EmptyState>
        )}
      </Section>
      {result.data.canLogWork && logWorkTaskId ? (
        <TaskWorkLogDialog taskId={logWorkTaskId} closeHref={listHref} />
      ) : null}
    </>
  );
}

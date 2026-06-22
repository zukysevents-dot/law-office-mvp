import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskStatus } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate } from "@/lib/format";
import {
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import {
  taskDeadlineTypeTone,
  taskStatusTone,
} from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type MyTasksData = {
  userName: string;
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: keyof typeof taskPriorityLabels;
    deadlineType: keyof typeof taskDeadlineTypeLabels;
    deadline: Date | null;
    project: { name: string } | null;
    case: { name: string; fileNumber: string | null } | null;
    createdBy: { name: string } | null;
    assignedTo: { name: string } | null;
    responsibleUser: { name: string } | null;
  }>;
};

export default async function MyTasksPage() {
  const result = await safeQuery<MyTasksData>(
    { userName: "Demo uživatel", tasks: [] },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tasks = await prisma.task.findMany({
        where: {
          organizationId: currentUser.organizationId,
          archivedAt: null,
          OR: [
            { assignedToId: currentUser.id },
            { responsibleUserId: currentUser.id },
            { createdById: currentUser.id },
          ],
        },
        orderBy: [
          { completedAt: "desc" },
          { deadline: "asc" },
          { createdAt: "desc" },
        ],
        include: {
          project: { select: { name: true } },
          case: { select: { name: true, fileNumber: true } },
          createdBy: { select: { name: true } },
          assignedTo: { select: { name: true } },
          responsibleUser: { select: { name: true } },
        },
      });

      return { userName: currentUser.name, tasks };
    },
  );

  return (
    <>
      <PageHeader
        title="Moje úkoly"
        description={`Úkoly, kde je ${result.data.userName} řešitel, odpovědná osoba nebo zadavatel.`}
        action={
          <ButtonLink href="/tasks" variant="secondary">
            Všechny úkoly
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Moje aktivní úkoly">
        {result.data.tasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Název</th>
                  <th>Projekt</th>
                  <th>Případ</th>
                  <th>Vytvořil</th>
                  <th>Řešitel</th>
                  <th>Odpovědná osoba</th>
                  <th>Priorita</th>
                  <th>Typ lhůty</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.tasks.map((task) => (
                  <tr key={task.id}>
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
                            task.case.fileNumber ? `, ${task.case.fileNumber}` : ""
                          }`
                        : "—"}
                    </td>
                    <td>{task.createdBy?.name ?? "—"}</td>
                    <td>{task.assignedTo?.name ?? "—"}</td>
                    <td>{task.responsibleUser?.name ?? "—"}</td>
                    <td>{taskPriorityLabels[task.priority]}</td>
                    <td>
                      <Badge tone={taskDeadlineTypeTone(task.deadlineType)}>
                        {taskDeadlineTypeLabels[task.deadlineType]}
                      </Badge>
                    </td>
                    <td>{formatDate(task.deadline)}</td>
                    <td>
                      <Badge tone={taskStatusTone(task.status)}>
                        {taskStatusLabels[task.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Aktuální demo uživatel nemá žádné aktivní úkoly.</EmptyState>
        )}
      </Section>
    </>
  );
}

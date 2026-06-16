import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { safeQuery } from "@/lib/db-safe";
import { taskStatusLabels } from "@/lib/labels";
import { andWhere, taskVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { taskStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type ArchivedTask = {
  id: string;
  title: string;
  completedAt: Date | null;
  project: { name: string } | null;
  case: { name: string; fileNumber: string | null } | null;
  assignedTo: { name: string } | null;
  statusHistory: Array<{
    id: string;
    oldStatus: keyof typeof taskStatusLabels;
    newStatus: keyof typeof taskStatusLabels;
    note: string | null;
    createdAt: Date;
    changedBy: { name: string } | null;
  }>;
};

export default async function TaskArchivePage() {
  const result = await safeQuery<{ tasks: ArchivedTask[] }>(
    { tasks: [] },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tasks = await prisma.task.findMany({
        where: andWhere(
          { archivedAt: { not: null } },
          taskVisibilityWhere(currentUser),
        ),
        orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          project: { select: { name: true } },
          case: { select: { name: true, fileNumber: true } },
          assignedTo: { select: { name: true } },
          statusHistory: {
            orderBy: { createdAt: "asc" },
            include: { changedBy: { select: { name: true } } },
          },
        },
      });

      return { tasks };
    },
  );

  return (
    <>
      <PageHeader
        title="Archiv úkolů"
        description="Dokončené a archivované úkoly včetně historie workflow stavů."
        action={
          <ButtonLink href="/tasks" variant="secondary">
            Zpět na aktivní úkoly
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Archivované úkoly">
        {result.data.tasks.length > 0 ? (
          <div className="grid gap-4">
            {result.data.tasks.map((task) => (
              <article
                key={task.id}
                className="rounded-md border border-stone-200 bg-stone-50 p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_14rem]">
                  <div>
                    <h2 className="text-base font-semibold text-stone-950">
                      {task.title}
                    </h2>
                    <div className="mt-2 grid gap-2 text-sm text-stone-700 md:grid-cols-3">
                      <p>
                        <span className="font-medium text-stone-950">
                          Projekt:
                        </span>{" "}
                        {task.project?.name ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Případ:</span>{" "}
                        {task.case
                          ? `${task.case.name}${
                              task.case.fileNumber
                                ? `, ${task.case.fileNumber}`
                                : ""
                            }`
                          : "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">
                          Řešitel:
                        </span>{" "}
                        {task.assignedTo?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="lg:text-right">
                    <p className="text-xs font-semibold uppercase text-stone-500">
                      Dokončeno
                    </p>
                    <p className="font-medium text-stone-950">
                      {formatDate(task.completedAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-stone-950">
                    Historie stavů
                  </h3>
                  {task.statusHistory.length > 0 ? (
                    <div className="mt-2 overflow-x-auto">
                      <table>
                        <thead>
                          <tr>
                            <th>Datum</th>
                            <th>Změna</th>
                            <th>Změnil</th>
                            <th>Poznámka</th>
                          </tr>
                        </thead>
                        <tbody>
                          {task.statusHistory.map((history) => (
                            <tr key={history.id}>
                              <td>{formatDate(history.createdAt)}</td>
                              <td>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={taskStatusTone(history.oldStatus)}>
                                    {taskStatusLabels[history.oldStatus]}
                                  </Badge>
                                  <span>→</span>
                                  <Badge tone={taskStatusTone(history.newStatus)}>
                                    {taskStatusLabels[history.newStatus]}
                                  </Badge>
                                </div>
                              </td>
                              <td>{history.changedBy?.name ?? "—"}</td>
                              <td>{history.note ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState>Úkol zatím nemá historii stavů.</EmptyState>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState>Archiv úkolů je zatím prázdný.</EmptyState>
        )}
      </Section>
    </>
  );
}

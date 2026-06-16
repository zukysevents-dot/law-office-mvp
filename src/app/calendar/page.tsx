import { CalendarDays } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { taskPriorityLabels, taskStatusLabels } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { andWhere, taskVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CalendarData = {
  deadlines: Array<{
    id: string;
    title: string;
    deadline: Date | null;
    priority: keyof typeof taskPriorityLabels;
    status: keyof typeof taskStatusLabels;
    assignedTo: { name: string } | null;
    project: { name: string } | null;
  }>;
};

export default async function CalendarPage() {
  const result = await safeQuery<CalendarData>(
    { deadlines: [] },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const deadlines = await prisma.task.findMany({
        where: andWhere(
          {
            archivedAt: null,
            deadline: { not: null },
          },
          taskVisibilityWhere(currentUser),
        ),
        orderBy: { deadline: "asc" },
        take: 30,
        select: {
          id: true,
          title: true,
          deadline: true,
          priority: true,
          status: true,
          assignedTo: { select: { name: true } },
          project: { select: { name: true } },
        },
      });

      return { deadlines };
    },
  );

  return (
    <>
      <PageHeader
        title="Kalendář"
        description="Nejbližší termíny z úkolů napříč projekty a případy."
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Nadcházející termíny">
        {result.data.deadlines.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Úkol</th>
                  <th>Projekt</th>
                  <th>Řešitel</th>
                  <th>Priorita</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.deadlines.map((task) => (
                  <tr key={task.id}>
                    <td className="font-medium text-stone-950">
                      {formatDate(task.deadline)}
                    </td>
                    <td>{task.title}</td>
                    <td>{task.project?.name ?? "—"}</td>
                    <td>{task.assignedTo?.name ?? "—"}</td>
                    <td>{taskPriorityLabels[task.priority]}</td>
                    <td>{taskStatusLabels[task.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Žádné nadcházející termíny.
            </span>
          </EmptyState>
        )}
      </Section>
    </>
  );
}

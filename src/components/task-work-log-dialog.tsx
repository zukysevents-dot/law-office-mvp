import { WorkLogCreateDialog } from "@/components/work-log-create-dialog";
import { WorkLogCreateForm } from "@/components/work-log-create-form";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { canAccessModule } from "@/lib/module-access.server";
import { andWhere, taskVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  emptyWorkLogFormOptions,
  loadWorkLogFormOptions,
} from "@/lib/work-logs/create-form.server";
import { buildTaskWorkLogPrefill } from "@/lib/work-logs/task-prefill";

/**
 * „Vykázat práci k úkolu“ — dialog nového výkazu práce otevřený z úkolu
 * (detail ?logWork=1, seznamy ?logWork=<id>). Subjekt, projekt, případ a úkol
 * jsou předvyplněné, datum práce je dnešní. Data se načítají jen při otevření
 * dialogu. Po uložení se createWorkLog vrátí na `closeHref` (stránka, odkud
 * byl dialog otevřen) bez parametru logWork a nový výkaz je hned vidět.
 * Bez přístupu k modulu výkazů se nic nevykreslí.
 */
export async function TaskWorkLogDialog({
  taskId,
  closeHref,
}: {
  taskId: string;
  closeHref: string;
}) {
  const currentUser = await getCurrentUser();
  if (!(await canAccessModule(currentUser, "module.workLogs"))) {
    return null;
  }

  const result = await safeQuery(
    { task: null, options: emptyWorkLogFormOptions },
    async () => {
      const prisma = getPrisma();
      const task = await prisma.task.findFirst({
        where: andWhere({ id: taskId }, taskVisibilityWhere(currentUser)),
        select: {
          id: true,
          title: true,
          projectId: true,
          caseId: true,
          project: { select: { mainSubjectId: true } },
          case: {
            select: {
              projectId: true,
              project: { select: { mainSubjectId: true } },
            },
          },
        },
      });
      const options = await loadWorkLogFormOptions(prisma, currentUser, {
        includeTaskId: task?.id,
      });
      return { task, options };
    },
  );
  const { task, options } = result.data;
  // Úkol, jehož projekt / případ divák nevidí, loader do nabídky nepřidá —
  // pak se nic nepředvyplní (server by výběr stejně odmítl).
  const prefill =
    task && options.tasks.some((item) => item.id === task.id)
      ? buildTaskWorkLogPrefill(task)
      : null;

  return (
    <WorkLogCreateDialog
      open
      closeHref={closeHref}
      title="Vykázat práci k úkolu"
      description={
        task && prefill
          ? `Úkol: ${task.title}. Subjekt, projekt, případ a úkol jsou předvyplněné.`
          : !result.databaseReady
            ? "Databáze není dostupná, výkaz teď nelze vytvořit."
            : "Úkol nebyl nalezen nebo k němu nemáte přístup."
      }
    >
      <WorkLogCreateForm
        formKey={`task-${taskId}`}
        options={options}
        prefill={prefill}
        returnTo={closeHref}
      />
    </WorkLogCreateDialog>
  );
}

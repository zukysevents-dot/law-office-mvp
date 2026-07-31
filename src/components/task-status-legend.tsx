import { TaskStatus } from "@/generated/prisma/enums";
import { taskStatusLabels } from "@/lib/labels";
import { taskStatusRowClass } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

export function TaskStatusLegend() {
  return (
    <div
      className="mb-4 flex flex-wrap gap-2 text-xs text-stone-700"
      aria-label="Legenda barev stavů úkolů"
    >
      {Object.values(TaskStatus).map((status) => (
        <span
          key={status}
          className={cn(
            "rounded-md border border-black/10 px-2 py-1",
            taskStatusRowClass(status),
          )}
        >
          {taskStatusLabels[status]}
        </span>
      ))}
      <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-800">
        Červený termín = po termínu
      </span>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import type { DueDateState } from "@/lib/due-date";
import { formatDateUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

// Termín úkolu / lhůty se stavem: „dnes" = červeně a se štítkem Dnes (ještě
// není po termínu), „po termínu" = červeně se štítkem Po termínu. Stav počítá
// volající přes lib/due-date (resp. isTaskOverdue / isTaskDueToday), protože
// splněné úkoly/lhůty se nezvýrazňují.
export function DueDateText({
  date,
  state,
  className,
}: {
  date: Date | string | null | undefined;
  state: DueDateState | null;
  className?: string;
}) {
  const highlighted = state === "today" || state === "overdue";
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1",
        highlighted && "font-semibold text-red-700",
        className,
      )}
    >
      <span className="whitespace-nowrap">{formatDateUtc(date)}</span>
      {state === "today" ? (
        <Badge
          tone="red"
          className="whitespace-nowrap border-red-600 bg-red-600 font-semibold text-white"
        >
          Dnes
        </Badge>
      ) : null}
      {state === "overdue" ? (
        <Badge tone="red" className="whitespace-nowrap font-semibold">
          Po termínu
        </Badge>
      ) : null}
    </span>
  );
}

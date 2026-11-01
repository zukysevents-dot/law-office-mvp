import Link from "next/link";
import { CalendarClock, Copy, MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import {
  describeTaskEvent,
  type TaskTimelineItem,
} from "@/lib/tasks/timeline";
import { cn } from "@/lib/utils";

const toneClasses = {
  postpone: "border-amber-200 bg-amber-50",
  change: "border-sky-200 bg-sky-50",
  duplicate: "border-violet-200 bg-violet-50",
} as const;

// Časová osa „Komentáře a historie“ na detailu úkolu: komentáře a události
// (odložení / změny termínu, duplikace), nejnovější nahoře.
export function TaskTimeline({
  items,
  visibleTaskIds,
}: {
  items: TaskTimelineItem[];
  /** Úkoly, které divák smí vidět (odkazy u duplikace). */
  visibleTaskIds: ReadonlySet<string>;
}) {
  if (items.length === 0) {
    return <EmptyState>Úkol zatím nemá komentáře ani historii.</EmptyState>;
  }
  return (
    <ol className="grid gap-3" aria-label="Komentáře a historie úkolu">
      {items.map((item) => {
        if (item.kind === "comment") {
          const { comment } = item;
          return (
            <li key={item.id}>
              <article className="rounded-md border border-[#dce4e8] bg-[#F4F7F8] p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <p className="flex items-center gap-2 font-medium text-[#0e1822]">
                    <MessageSquare className="h-4 w-4 text-[#566673]" aria-hidden="true" />
                    {comment.author?.name ?? "Neznámý autor"}
                  </p>
                  <p className="text-stone-500">{formatDateTime(comment.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{comment.comment}</p>
              </article>
            </li>
          );
        }
        const { event } = item;
        const text = describeTaskEvent(event, {
          relatedVisible: Boolean(
            event.relatedTask && visibleTaskIds.has(event.relatedTask.id),
          ),
        });
        const Icon = text.tone === "duplicate" ? Copy : CalendarClock;
        return (
          <li key={item.id}>
            <article
              data-testid="task-event"
              className={cn("rounded-md border p-3", toneClasses[text.tone])}
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 font-medium text-[#0e1822]">
                  <Icon className="h-4 w-4 text-[#566673]" aria-hidden="true" />
                  <span>{text.title}</span>
                  {text.link ? (
                    <Link href={text.link.href} className="text-emerald-950 underline">
                      {text.link.label}
                    </Link>
                  ) : null}
                </p>
                <p className="text-stone-500">
                  {event.actor?.name ?? "Neznámý uživatel"} · {formatDateTime(event.createdAt)}
                </p>
              </div>
              {text.detail ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">{text.detail}</p>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

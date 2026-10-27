// Časová osa detailu úkolu („Komentáře a historie“): komentáře a události
// úkolu (odložení / změny termínu, duplikace) v jednom seznamu, nejnovější
// nahoře. Čistý modul (unit testy).

import { formatTaskDeadline } from "@/lib/tasks/deadline-history";

export type TimelineComment = {
  id: string;
  comment: string;
  createdAt: Date;
  author: { name: string } | null;
};

export type TimelineEvent = {
  id: string;
  type: string;
  oldDeadline: Date | null;
  newDeadline: Date | null;
  reason: string | null;
  /** Změna v „Upravit úkol“ (false = akce „Odložit“). */
  viaEdit?: boolean;
  createdAt: Date;
  actor: { name: string } | null;
  relatedTask: { id: string; title: string } | null;
};

export type TaskTimelineItem =
  | { kind: "comment"; id: string; createdAt: Date; comment: TimelineComment }
  | { kind: "event"; id: string; createdAt: Date; event: TimelineEvent };

export function buildTaskTimeline(
  comments: readonly TimelineComment[],
  events: readonly TimelineEvent[],
): TaskTimelineItem[] {
  const items: TaskTimelineItem[] = [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      id: `comment:${comment.id}`,
      createdAt: comment.createdAt,
      comment,
    })),
    ...events.map((event) => ({
      kind: "event" as const,
      id: `event:${event.id}`,
      createdAt: event.createdAt,
      event,
    })),
  ];
  return items.sort((left, right) => {
    const diff = right.createdAt.getTime() - left.createdAt.getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
}

export type TaskEventDescription = {
  /** Hlavní věta záznamu. */
  title: string;
  /** Odkaz na související úkol (jen pokud ho divák vidí). */
  link: { href: string; label: string } | null;
  /** Doplňující řádek (důvod odložení). */
  detail: string | null;
  tone: "postpone" | "change" | "duplicate";
};

/**
 * Texty záznamu události. `relatedVisible` = divák smí související úkol vidět;
 * jinak se jeho název ani odkaz neprozradí.
 */
export function describeTaskEvent(
  event: Pick<
    TimelineEvent,
    "type" | "oldDeadline" | "newDeadline" | "reason" | "relatedTask" | "viaEdit"
  >,
  { relatedVisible }: { relatedVisible: boolean },
): TaskEventDescription {
  const from = formatTaskDeadline(event.oldDeadline);
  const to = formatTaskDeadline(event.newDeadline);
  const detail = event.reason ? `Důvod: ${event.reason}` : null;
  const related =
    relatedVisible && event.relatedTask
      ? {
          href: `/tasks/${event.relatedTask.id}`,
          label: `„${event.relatedTask.title}“`,
        }
      : null;

  switch (event.type) {
    case "DEADLINE_POSTPONED":
      return {
        // Posun na pozdější datum v úpravě úkolu se počítá jako odložení,
        // ale text říká, odkud změna přišla.
        title: event.viaEdit
          ? `Termín změněn při úpravě úkolu z ${from} na ${to}`
          : `Termín odložen z ${from} na ${to}`,
        link: null,
        detail,
        tone: "postpone",
      };
    case "DEADLINE_CHANGED": {
      let title: string;
      if (event.oldDeadline && event.newDeadline) {
        title = `Termín změněn při úpravě úkolu z ${from} na ${to}`;
      } else if (event.newDeadline) {
        title = `Termín nastaven při úpravě úkolu na ${to}`;
      } else {
        title = `Termín odstraněn při úpravě úkolu (byl ${from})`;
      }
      return { title, link: null, detail, tone: "change" };
    }
    case "DUPLICATED_FROM":
      return {
        title: related
          ? "Úkol vytvořen duplikací z úkolu"
          : event.relatedTask
            ? "Úkol vytvořen duplikací z úkolu, ke kterému nemáte přístup"
            : "Úkol vytvořen duplikací (původní úkol už neexistuje)",
        link: related,
        detail: null,
        tone: "duplicate",
      };
    case "DUPLICATED_TO":
      return {
        title: related
          ? "Úkol byl duplikován do"
          : event.relatedTask
            ? "Úkol byl duplikován do úkolu, ke kterému nemáte přístup"
            : "Úkol byl duplikován (kopie už neexistuje)",
        link: related,
        detail: null,
        tone: "duplicate",
      };
    default:
      return { title: "Změna úkolu", link: null, detail, tone: "change" };
  }
}

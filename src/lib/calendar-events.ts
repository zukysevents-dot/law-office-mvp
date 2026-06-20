/**
 * Unified calendar event model + aggregator (Fáze 2L).
 *
 * This is the single seam every calendar source flows through. Today it surfaces
 * task deadlines (procesní/interní lhůty); future sources — Outlook events, and
 * later meetings (schůzky) — plug in here only, so the page and UI never change.
 */

import type { BadgeTone } from "@/components/ui/badge";
import type {
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { andWhere, taskVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { taskDeadlineTypeTone } from "@/lib/status-tones";

/** Minimal user shape the calendar needs: visibility (`id`/`role`). */
export type CalendarUser = {
  id: string;
  role: UserRole;
};

export type CalendarRange = { start: Date; end: Date };

// Safety cap so a partner viewing a busy window can't load an unbounded set of
// deadlines into the RSC payload. A month grid is 42 days; 500 is far above any
// realistic per-window count yet bounds pathological data.
const TASK_EVENT_LIMIT = 500;

export type CalendarEvent = {
  id: string;
  title: string;
  date: Date;
  allDay: boolean;
  href?: string;
  tone: BadgeTone;
  deadlineType?: TaskDeadlineType;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeName?: string;
  projectName?: string;
};

/** Wire form for crossing the Server→Client boundary (Date → ISO string). */
export type SerializedCalendarEvent = Omit<CalendarEvent, "date"> & {
  dateIso: string;
};

export function serializeCalendarEvent(
  event: CalendarEvent,
): SerializedCalendarEvent {
  const { date, ...rest } = event;
  return { ...rest, dateIso: date.toISOString() };
}

async function getTaskDeadlineEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  const prisma = getPrisma();
  const tasks = await prisma.task.findMany({
    where: andWhere(
      {
        archivedAt: null,
        deadline: { gte: range.start, lt: range.end },
      },
      taskVisibilityWhere(user),
    ),
    orderBy: { deadline: "asc" },
    take: TASK_EVENT_LIMIT,
    select: {
      id: true,
      title: true,
      deadline: true,
      deadlineType: true,
      status: true,
      priority: true,
      assignedTo: { select: { name: true } },
      project: { select: { name: true } },
      case: { select: { name: true } },
    },
  });

  return tasks
    .filter(
      (task): task is typeof task & { deadline: Date } => task.deadline !== null,
    )
    .map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      date: task.deadline,
      allDay: true,
      href: `/tasks/${task.id}`,
      tone: taskDeadlineTypeTone(task.deadlineType),
      deadlineType: task.deadlineType,
      status: task.status,
      priority: task.priority,
      assigneeName: task.assignedTo?.name ?? undefined,
      projectName: task.project?.name ?? task.case?.name ?? undefined,
    }));
}

/** Aggregate every calendar source for `user` within `range`, sorted by date. */
export async function getCalendarEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  // Only task deadlines today; getTaskDeadlineEvents already returns them
  // ordered by deadline asc. Future sources (Outlook, meetings) merge in here.
  return getTaskDeadlineEvents(user, range);
}

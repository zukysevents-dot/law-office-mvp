/**
 * Unified calendar event model + aggregator (Fáze 2L).
 *
 * This is the single seam every calendar source flows through. Today it surfaces
 * task deadlines (procesní/interní lhůty); future sources — Outlook events, and
 * later meetings (schůzky) — plug in here only, so the page and UI never change.
 */

import type { BadgeTone } from "@/components/ui/badge";
import {
  DeadlineStatus,
  type TaskDeadlineType,
  type TaskPriority,
  type TaskStatus,
  type UserRole,
} from "@/generated/prisma/enums";
import {
  andWhere,
  courtHearingVisibilityWhere,
  deadlineVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { deadlineTypeTone, taskDeadlineTypeTone } from "@/lib/status-tones";

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
  kind?: "task" | "deadline" | "hearing";
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

// F4 / L-4: watched deadlines (Deadline) within the window. CANCELLED deadlines
// are soft-deleted (archivedAt set) so the archivedAt filter excludes them;
// COMPLETED ones stay visible and the view greys them via status === "COMPLETED".
async function getDeadlineEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  const prisma = getPrisma();
  const deadlines = await prisma.deadline.findMany({
    where: andWhere(
      {
        archivedAt: null,
        dueDate: { gte: range.start, lt: range.end },
      },
      deadlineVisibilityWhere(user),
    ),
    orderBy: { dueDate: "asc" },
    take: TASK_EVENT_LIMIT,
    select: {
      id: true,
      title: true,
      dueDate: true,
      type: true,
      status: true,
      responsibleUser: { select: { name: true } },
      case: { select: { id: true, name: true } },
    },
  });

  return deadlines.map((deadline) => ({
    id: `deadline:${deadline.id}`,
    title: `Lhůta: ${deadline.title}`,
    date: deadline.dueDate,
    allDay: true,
    href: `/cases/${deadline.case.id}`,
    tone: deadlineTypeTone(deadline.type),
    kind: "deadline" as const,
    // Reuse the view's COMPLETED greying; OPEN deadlines carry no status.
    status:
      deadline.status === DeadlineStatus.COMPLETED
        ? ("COMPLETED" satisfies TaskStatus)
        : undefined,
    assigneeName: deadline.responsibleUser?.name ?? undefined,
    projectName: deadline.case.name,
  }));
}

// F4 / L-4: court hearings (CourtHearing) within the window. hearingAt carries a
// time, so these are NOT all-day events.
async function getCourtHearingEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  const prisma = getPrisma();
  const hearings = await prisma.courtHearing.findMany({
    where: andWhere(
      {
        archivedAt: null,
        hearingAt: { gte: range.start, lt: range.end },
      },
      courtHearingVisibilityWhere(user),
    ),
    orderBy: { hearingAt: "asc" },
    take: TASK_EVENT_LIMIT,
    select: {
      id: true,
      court: true,
      hearingAt: true,
      room: true,
      responsibleUser: { select: { name: true } },
      case: { select: { id: true, name: true } },
    },
  });

  return hearings.map((hearing) => ({
    id: `hearing:${hearing.id}`,
    title: `Jednání: ${hearing.court}${hearing.room ? ` (${hearing.room})` : ""}`,
    date: hearing.hearingAt,
    allDay: false,
    href: `/cases/${hearing.case.id}`,
    tone: "purple" as BadgeTone,
    kind: "hearing" as const,
    assigneeName: hearing.responsibleUser?.name ?? undefined,
    projectName: hearing.case.name,
  }));
}

/** Aggregate every calendar source for `user` within `range`, sorted by date. */
export async function getCalendarEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  // Task deadlines + watched deadlines + court hearings (F4). Each source is
  // visibility-scoped independently; future sources (Outlook) merge in here too.
  const [tasks, deadlines, hearings] = await Promise.all([
    getTaskDeadlineEvents(user, range),
    getDeadlineEvents(user, range),
    getCourtHearingEvents(user, range),
  ]);

  return [...tasks, ...deadlines, ...hearings].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

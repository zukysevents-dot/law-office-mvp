/**
 * Unified calendar event model + aggregator (Fáze 2L).
 *
 * This is the single seam the office's calendar sources flow through: task
 * deadlines, watched deadlines (Lhůtník) and court hearings. The personal
 * Outlook (ICS) feed is a separate event source in the view (own toggle, own
 * error handling, strictly per user) — see lib/calendar/outlook-feed.server.ts
 * — but shares the serialized event shape below.
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
import { calendarDeadlineWhere } from "@/lib/deadlines";
import { getPrisma } from "@/lib/prisma";
import { deadlineTypeTone, taskDeadlineTypeTone } from "@/lib/status-tones";
import {
  formatAssigneeNames,
  taskPeopleFromRecord,
  taskPeopleSelect,
} from "@/lib/tasks/task-people";

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
  /** Exclusive end (all-day: the day after the last day). */
  end?: Date;
  allDay: boolean;
  href?: string;
  tone: BadgeTone;
  kind?: "task" | "deadline" | "hearing" | "outlook";
  location?: string;
  deadlineType?: TaskDeadlineType;
  status?: TaskStatus;
  priority?: TaskPriority;
  // Řešitelé úkolu (všichni, hlavní první) a dohled — do tooltipu události.
  assigneeName?: string;
  supervisorNames?: string;
  projectName?: string;
  // Text tooltipu (title) události v kalendáři.
  tooltip?: string;
};

// Tooltip události: „{název} – Řešitelé: A, B; Dohled: C“.
export function calendarEventTooltip(
  event: Pick<CalendarEvent, "title" | "assigneeName" | "supervisorNames">,
) {
  const parts = [
    event.assigneeName ? `Řešitelé: ${event.assigneeName}` : null,
    event.supervisorNames ? `Dohled: ${event.supervisorNames}` : null,
  ].filter(Boolean);
  return parts.length > 0
    ? `${event.title} – ${parts.join("; ")}`
    : event.title;
}

/** Wire form for crossing the Server→Client boundary (Date → ISO string). */
export type SerializedCalendarEvent = Omit<CalendarEvent, "date" | "end"> & {
  dateIso: string;
  /** FullCalendar value: "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:mm:ss". */
  start: string;
  end?: string;
};

/**
 * FullCalendar runs with timeZone="UTC" over the app's "wall clock pinned to
 * UTC" values (date-only fields at UTC midnight, datetime-local inputs pinned
 * by form.ts). So the wire value is the UTC calendar date for all-day events
 * and the UTC wall clock WITHOUT a zone suffix for timed ones — sending only
 * the date (as before) dropped the time of court hearings.
 */
export function toCalendarWireDate(date: Date, allDay: boolean): string {
  const iso = date.toISOString();
  return allDay ? iso.slice(0, 10) : iso.slice(0, 19);
}

export function serializeCalendarEvent(
  event: CalendarEvent,
): SerializedCalendarEvent {
  const { date, end, ...rest } = event;
  return {
    ...rest,
    dateIso: date.toISOString(),
    start: toCalendarWireDate(date, event.allDay),
    ...(end ? { end: toCalendarWireDate(end, event.allDay) } : {}),
  };
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
      ...taskPeopleSelect,
      project: { select: { name: true } },
      case: { select: { name: true } },
    },
  });

  return tasks
    .filter(
      (task): task is typeof task & { deadline: Date } =>
        task.deadline !== null,
    )
    .map((task) => {
      const people = taskPeopleFromRecord(task);
      const assigneeName =
        formatAssigneeNames(people.assignees, { markPrimary: false }) ||
        undefined;
      const supervisorNames =
        people.supervisors.map((person) => person.name).join(", ") || undefined;
      return {
        id: `task:${task.id}`,
        title: task.title,
        date: task.deadline,
        allDay: true,
        href: `/tasks/${task.id}`,
        tone: taskDeadlineTypeTone(task.deadlineType),
        deadlineType: task.deadlineType,
        status: task.status,
        priority: task.priority,
        assigneeName,
        supervisorNames,
        projectName: task.project?.name ?? task.case?.name ?? undefined,
        tooltip: calendarEventTooltip({
          title: task.title,
          assigneeName,
          supervisorNames,
        }),
      };
    });
}

// F4 / L-4: watched deadlines (Deadline) within the window. CANCELLED deadlines
// are hidden; fulfilled (COMPLETED) ones stay visible — even once archived —
// and the view greys them via status === "COMPLETED" (calendarDeadlineWhere).
async function getDeadlineEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  const prisma = getPrisma();
  const deadlines = await prisma.deadline.findMany({
    where: andWhere(
      calendarDeadlineWhere(),
      { dueDate: { gte: range.start, lt: range.end } },
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
    title:
      deadline.status === DeadlineStatus.COMPLETED
        ? `Lhůta (splněno): ${deadline.title}`
        : `Lhůta: ${deadline.title}`,
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

// Čí kalendář (testování 19. 10.): uživatelé neměli vlastní kalendář — viděli
// termíny všech úkolů, lhůt a jednání, které jim dovolí viditelnost (výchozí
// rozsah úkolů je „Vše"). Výchozí pohled je teď „Můj kalendář"; „Můj tým" jen
// pro člena týmu, „Celá kancelář" jen s oprávněním „Vidí reporty týmu a
// kolegů" (function.viewTeamReports). Každý filtr se VŽDY skládá s
// *VisibilityWhere — nikdy neodkryje víc, než uživatel smí vidět.

import type { Prisma } from "@/generated/prisma/client";

export const CALENDAR_SCOPES = ["mine", "team", "all"] as const;

export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

export const calendarScopeLabels: Record<CalendarScope, string> = {
  mine: "Můj kalendář",
  team: "Můj tým",
  all: "Celá kancelář",
};

export function availableCalendarScopes({
  hasTeam,
  canViewOffice,
}: {
  hasTeam: boolean;
  canViewOffice: boolean;
}): CalendarScope[] {
  return CALENDAR_SCOPES.filter(
    (scope) =>
      scope === "mine" ||
      (scope === "team" && hasTeam) ||
      (scope === "all" && canViewOffice),
  );
}

/** Requested scope if allowed, else the default „mine" (fail-closed). */
export function resolveCalendarScope(
  requested: unknown,
  available: readonly CalendarScope[],
): CalendarScope {
  return typeof requested === "string" &&
    (available as readonly string[]).includes(requested)
    ? (requested as CalendarScope)
    : "mine";
}

export type CalendarPeopleFilters = {
  task: Prisma.TaskWhereInput;
  deadline: Prisma.DeadlineWhereInput;
  hearing: Prisma.CourtHearingWhereInput;
};

/**
 * Events „of" a set of people (me, or my team): a task they solve (any
 * assignee row or the legacy main assignee), supervise or are responsible
 * for; a deadline / court hearing they are responsible for, directly or as
 * the case's responsible lawyer (the same people the reminders go to). The
 * mere creator of a delegated task does not get it in their calendar.
 *
 * Nobody-owned items must not vanish from every personal calendar (only the
 * office view would show them — a missed procedural deadline is the firm's
 * liability): a task with no solver/responsible person stays with its
 * creator; a deadline / hearing with no responsible person stays with its
 * creator and with the people assigned to its case.
 */
export function calendarPeopleFilters(
  userIds: readonly string[],
): CalendarPeopleFilters {
  const ids = { in: [...userIds] };
  return {
    task: {
      OR: [
        { assignedToId: ids },
        { responsibleUserId: ids },
        { assignees: { some: { userId: ids } } },
        {
          assignedToId: null,
          responsibleUserId: null,
          assignees: { none: {} },
          createdById: ids,
        },
      ],
    },
    deadline: {
      OR: [
        { responsibleUserId: ids },
        { case: { is: { responsibleUserId: ids } } },
        { responsibleUserId: null, createdById: ids },
        {
          responsibleUserId: null,
          case: { is: { assignees: { some: { userId: ids } } } },
        },
      ],
    },
    hearing: {
      OR: [
        { responsibleUserId: ids },
        { case: { is: { responsibleUserId: ids } } },
        { responsibleUserId: null, createdById: ids },
        {
          responsibleUserId: null,
          case: { is: { assignees: { some: { userId: ids } } } },
        },
      ],
    },
  };
}

import "server-only";

import {
  availableCalendarScopes,
  calendarPeopleFilters,
  resolveCalendarScope,
  type CalendarPeopleFilters,
  type CalendarScope,
} from "@/lib/calendar-scope";
import { canViewTeamReports } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

type ScopeUser = Parameters<typeof canViewTeamReports>[0] & {
  id: string;
  organizationId: string | null;
};

export type CalendarScopeContext = {
  available: CalendarScope[];
  /** Members of the viewer's (non-archived) team, the viewer included. */
  teamMemberIds: string[];
};

export async function getCalendarScopeContext(
  user: ScopeUser,
): Promise<CalendarScopeContext> {
  const organizationId = user.organizationId;
  let teamMemberIds: string[] = [];
  if (organizationId) {
    const prisma = getPrisma();
    // One team per member and org (@@unique organizationId+userId).
    const membership = await prisma.legalTeamMember.findFirst({
      where: { organizationId, userId: user.id, legalTeam: { archivedAt: null } },
      select: { legalTeamId: true },
    });
    if (membership) {
      const members = await prisma.legalTeamMember.findMany({
        where: { organizationId, legalTeamId: membership.legalTeamId },
        select: { userId: true },
      });
      teamMemberIds = members.map((member) => member.userId);
    }
  }

  return {
    available: availableCalendarScopes({
      hasTeam: teamMemberIds.length > 0,
      canViewOffice: canViewTeamReports(user),
    }),
    teamMemberIds,
  };
}

/**
 * The people filter for the requested calendar scope (null = „Celá
 * kancelář", i.e. visibility only). An unknown or forbidden scope degrades to
 * „Můj kalendář". Callers still AND the visibility helpers on every query.
 */
export async function resolveCalendarPeopleFilters(
  user: ScopeUser,
  requested: unknown,
): Promise<{ scope: CalendarScope; people: CalendarPeopleFilters | null }> {
  const context = await getCalendarScopeContext(user);
  const scope = resolveCalendarScope(requested, context.available);
  if (scope === "all") {
    return { scope, people: null };
  }
  const userIds =
    scope === "team"
      ? Array.from(new Set([user.id, ...context.teamMemberIds]))
      : [user.id];
  return { scope, people: calendarPeopleFilters(userIds) };
}

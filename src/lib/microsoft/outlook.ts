/**
 * Outlook calendar — deferred event source (Fáze 2L seam).
 *
 * Fetching a user's real Outlook events requires user-delegated Microsoft
 * sign-in (Entra ID SSO) plus per-user refresh tokens, which do not exist yet —
 * Fáze 2I only added app-only Graph access for SharePoint folders. Until that
 * lands, this returns no events and the calendar shows only internal task
 * deadlines, mirroring the graceful degradation of `graph-client.ts` and the
 * SMTP layer.
 *
 * The aggregator in `calendar-events.ts` already calls this, so wiring real
 * Outlook events in later is purely additive — no caller changes needed.
 */

import type {
  CalendarEvent,
  CalendarRange,
  CalendarUser,
} from "@/lib/calendar-events";
import { isMicrosoftLoginEnabled } from "@/lib/microsoft/config";

/** True only once the (future) user-delegated login flow is switched on. */
export function isOutlookCalendarEnabled(): boolean {
  return isMicrosoftLoginEnabled();
}

export async function getOutlookCalendarEvents(
  user: CalendarUser,
  range: CalendarRange,
): Promise<CalendarEvent[]> {
  if (!isOutlookCalendarEnabled() || !user.microsoftId) {
    return [];
  }

  // TODO(Microsoft phase): once user-delegated OAuth + refresh-token storage
  // exist, acquire the user's access token and call:
  //   GET https://graph.microsoft.com/v1.0/me/calendarView
  //       ?startDateTime={range.start ISO}&endDateTime={range.end ISO}
  // then map each event → CalendarEvent ({ id: `outlook:${ev.id}` so React keys
  // never collide with `task:` ids, source: "outlook", allDay: ev.isAllDay,
  // tone: "blue", href: ev.webLink }). Until then we degrade to no Outlook events.
  void range;
  return [];
}

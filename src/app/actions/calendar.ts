"use server";

import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  getCalendarEvents,
  serializeCalendarEvent,
  type SerializedCalendarEvent,
} from "@/lib/calendar-events";

/**
 * Fetch calendar events for a date range, scoped to the current user's
 * visibility. Called by the FullCalendar event source on every range change
 * (initial mount, prev/next, view switch) so access control stays server-side.
 *
 * `startIso`/`endIso` come from FullCalendar's `fetchInfo` (end is exclusive,
 * matching the `lt` bound in the underlying Prisma query). On any DB error we
 * degrade to an empty calendar rather than throwing into the UI.
 */
export async function fetchCalendarEvents(
  startIso: string,
  endIso: string,
): Promise<SerializedCalendarEvent[]> {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DEADLINES);

  try {
    const events = await getCalendarEvents(currentUser, { start, end });
    return events.map(serializeCalendarEvent);
  } catch {
    return [];
  }
}

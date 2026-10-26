"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  getCalendarEvents,
  serializeCalendarEvent,
  type SerializedCalendarEvent,
} from "@/lib/calendar-events";
import { IcsFetchError, icsErrorMessage } from "@/lib/calendar/ics-errors";
import { fetchIcsFeed, normalizeIcsUrl, urlHint } from "@/lib/calendar/ics-fetch";
import { countIcsEvents, parseIcs } from "@/lib/calendar/ics-parse";
import {
  getOutlookFeedSummary,
  getOutlookOccurrences,
  OUTLOOK_PROVIDER,
  refreshOwnOutlookFeed,
  sealSecretUrl,
} from "@/lib/calendar/outlook-feed.server";
import {
  formatEventCount,
  type OutlookFeedSummary,
} from "@/lib/calendar/outlook-summary";
import { optionalString } from "@/lib/form";
import { assertCanAccessModule } from "@/lib/module-access.server";
import { getPrisma } from "@/lib/prisma";

function parseRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { start, end };
}

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
  const range = parseRange(startIso, endIso);
  if (!range) {
    return [];
  }

  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.calendar");

  try {
    const events = await getCalendarEvents(currentUser, range);
    return events.map(serializeCalendarEvent);
  } catch {
    return [];
  }
}

// --- Outlook (ICS) ------------------------------------------------------------
// Strictly personal: every action reads/writes only the caller's own feed
// (organizationId + userId of the session user), whatever their role.

async function outlookUser() {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.calendar");
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  return { ...currentUser, organizationId };
}

/** The caller's own Outlook events in the range — from the cache only. */
export async function fetchOutlookCalendarEvents(
  startIso: string,
  endIso: string,
): Promise<SerializedCalendarEvent[]> {
  const range = parseRange(startIso, endIso);
  if (!range) {
    return [];
  }
  const currentUser = await outlookUser();
  try {
    const occurrences = await getOutlookOccurrences(currentUser, range);
    return occurrences.map((occurrence) => ({
      id: occurrence.key,
      title: occurrence.title,
      allDay: occurrence.allDay,
      tone: "blue",
      kind: "outlook",
      location: occurrence.location,
      dateIso: occurrence.start.toISOString(),
      start: occurrence.startWire,
      end: occurrence.endWire,
    }));
  } catch {
    return [];
  }
}

/**
 * Re-download the caller's feed when stale (`force` = „Obnovit teď"). Returns
 * the fresh summary; the calendar then refetches only its Outlook source.
 */
export async function refreshOutlookCalendar(
  force = false,
): Promise<OutlookFeedSummary | null> {
  const currentUser = await outlookUser();
  await refreshOwnOutlookFeed(currentUser, { force: force === true });
  return getOutlookFeedSummary(currentUser);
}

export type OutlookFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  submittedAt?: number;
};

function revalidateCalendarPages() {
  revalidatePath("/calendar");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

/**
 * Connect (or replace) the caller's Outlook calendar: the pasted ICS link is
 * validated, downloaded and parsed BEFORE anything is stored, then saved
 * encrypted (DATA_ENCRYPTION_KEY) together with the first cache.
 */
export async function saveOutlookCalendarUrl(
  _previous: OutlookFormState,
  formData: FormData,
): Promise<OutlookFormState> {
  const submittedAt = Date.now();
  const currentUser = await outlookUser();
  const raw = optionalString(formData, "icsUrl");

  let url: URL;
  let body: string;
  let etag: string | null;
  let lastModified: string | null;
  let eventCount: number;
  try {
    if (!raw) {
      throw new IcsFetchError("INVALID_URL");
    }
    url = normalizeIcsUrl(raw);
    const result = await fetchIcsFeed(url.toString());
    if (result.status !== "ok") {
      throw new IcsFetchError("NETWORK");
    }
    body = result.body;
    etag = result.etag;
    lastModified = result.lastModified;
    eventCount = countIcsEvents(parseIcs(body));
  } catch (error) {
    const message =
      error instanceof IcsFetchError
        ? icsErrorMessage(error.code, error.status)
        : icsErrorMessage("NETWORK");
    return { ok: false, error: message, submittedAt };
  }

  const prisma = getPrisma();
  const owner = { organizationId: currentUser.organizationId, userId: currentUser.id };
  const existing = await prisma.calendarFeed.findUnique({
    where: { organizationId_userId: owner },
    select: { id: true },
  });
  const sealed = sealSecretUrl(url.toString());
  const now = new Date();
  const data = {
    provider: OUTLOOK_PROVIDER,
    ...sealed,
    urlHint: urlHint(url),
    icsBody: body,
    etag,
    lastModified,
    fetchedAt: now,
    lastAttemptAt: now,
    lastErrorCode: null,
    lastErrorStatus: null,
    refreshLockedAt: null,
  };
  const feed = await prisma.calendarFeed.upsert({
    where: { organizationId_userId: owner },
    create: { ...owner, ...data },
    update: data,
    select: { id: true },
  });

  // Never the URL / token — only what is safe to show.
  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "CalendarFeed",
    entityId: feed.id,
    action: existing ? "UPDATE" : "CONNECT",
    changedById: currentUser.id,
    newValue: {
      provider: OUTLOOK_PROVIDER,
      host: url.hostname,
      encrypted: sealed.isEncrypted,
    },
  });

  revalidateCalendarPages();
  return {
    ok: true,
    message: `Outlook kalendář je propojený. Načteno ${formatEventCount(eventCount)}.`,
    submittedAt,
  };
}

/** Disconnect: deletes the caller's feed (secret link + cached events). */
export async function disconnectOutlookCalendar() {
  const currentUser = await outlookUser();
  const prisma = getPrisma();
  const owner = { organizationId: currentUser.organizationId, userId: currentUser.id };
  const feed = await prisma.calendarFeed.findUnique({
    where: { organizationId_userId: owner },
    select: { id: true, provider: true, urlHint: true },
  });
  if (feed) {
    await prisma.calendarFeed.delete({ where: { id: feed.id } });
    await writeAuditLog({
      organizationId: currentUser.organizationId,
      entityType: "CalendarFeed",
      entityId: feed.id,
      action: "DISCONNECT",
      changedById: currentUser.id,
      oldValue: {
        provider: feed.provider,
        host: feed.urlHint.split("/")[0] ?? null,
      },
    });
  }
  revalidateCalendarPages();
}

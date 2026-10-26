import "server-only";

// Personal Outlook (ICS) calendar feeds: secret handling, cached download and
// expansion for the calendar view. One feed per user and office; only its
// owner ever reads it (every query is keyed by the caller's own userId +
// organizationId — never by a role-based visibility scope).

import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  IcsFetchError,
  icsErrorMessage,
  isIcsErrorCode,
  type IcsErrorCode,
} from "@/lib/calendar/ics-errors";
import { fetchIcsFeed, type FetchIcsOptions } from "@/lib/calendar/ics-fetch";
import {
  expandIcsEvents,
  parseIcs,
  type OutlookOccurrence,
  type ParsedCalendar,
} from "@/lib/calendar/ics-parse";
import {
  OUTLOOK_NOT_CONNECTED,
  type OutlookFeedSummary,
} from "@/lib/calendar/outlook-summary";
import { getPrisma } from "@/lib/prisma";

export const OUTLOOK_PROVIDER = "OUTLOOK_ICS";
/** Calendar view refreshes a cache older than this (and retries failures). */
export const OUTLOOK_STALE_MS = 10 * 60_000;
/** The hourly cron refreshes caches older than this. */
export const OUTLOOK_CRON_STALE_MS = 50 * 60_000;
/** A crashed refresh releases its lock after this. */
const REFRESH_LOCK_MS = 60_000;
/** „Obnovit teď" at most once a minute per feed. */
const FORCED_REFRESH_MIN_INTERVAL_MS = 60_000;

export type FeedOwner = { id: string; organizationId: string | null };

function ownerWhere(user: FeedOwner) {
  if (!user.organizationId) {
    return null;
  }
  return { organizationId: user.organizationId, userId: user.id };
}

// --- secret URL ---------------------------------------------------------------

/** Value to store for a freshly entered URL (+ whether it is encrypted). */
export function sealSecretUrl(url: string): { secretUrl: string; isEncrypted: boolean } {
  if (isEncryptionConfigured()) {
    return { secretUrl: encryptSecret(url), isEncrypted: true };
  }
  // Graceful fallback without DATA_ENCRYPTION_KEY (the UI warns about it).
  return { secretUrl: url, isEncrypted: false };
}

function readSecretUrl(feed: { secretUrl: string; isEncrypted: boolean }): string {
  if (!feed.isEncrypted) {
    return feed.secretUrl;
  }
  try {
    return decryptSecret(feed.secretUrl);
  } catch {
    // Key missing/rotated → the user must paste the link again.
    throw new IcsFetchError("SECRET_UNREADABLE");
  }
}

// --- summary --------------------------------------------------------------------

export async function getOutlookFeedSummary(
  user: FeedOwner,
  now: Date = new Date(),
): Promise<OutlookFeedSummary> {
  const where = ownerWhere(user);
  const encryptionReady = isEncryptionConfigured();
  if (!where) {
    return { ...OUTLOOK_NOT_CONNECTED, encryptionReady };
  }
  // Never select secretUrl / icsBody here.
  const feed = await getPrisma().calendarFeed.findUnique({
    where: { organizationId_userId: where },
    select: {
      urlHint: true,
      isEncrypted: true,
      fetchedAt: true,
      lastErrorCode: true,
      lastErrorStatus: true,
    },
  });
  if (!feed) {
    return { ...OUTLOOK_NOT_CONNECTED, encryptionReady };
  }
  const errorCode: IcsErrorCode | null = isIcsErrorCode(feed.lastErrorCode)
    ? feed.lastErrorCode
    : feed.lastErrorCode
      ? "NETWORK"
      : null;
  return {
    connected: true,
    urlHint: feed.urlHint,
    fetchedAtIso: feed.fetchedAt?.toISOString() ?? null,
    stale:
      !feed.fetchedAt || now.getTime() - feed.fetchedAt.getTime() >= OUTLOOK_STALE_MS,
    errorMessage: errorCode ? icsErrorMessage(errorCode, feed.lastErrorStatus) : null,
    encrypted: feed.isEncrypted,
    encryptionReady,
  };
}

// --- refresh --------------------------------------------------------------------

export type RefreshOutcome =
  | "refreshed"
  | "not-modified"
  | "failed"
  | "fresh"
  | "throttled"
  | "locked"
  | "missing";

/**
 * Download the feed again when its cache is stale (or `force`). Concurrency-
 * safe via a short lock on refreshLockedAt; on failure the previous cache is
 * kept and only the error code is stored. Routine refreshes write no audit row.
 */
export async function refreshOutlookFeed(
  feedId: string,
  {
    force = false,
    staleMs = OUTLOOK_STALE_MS,
    now = new Date(),
    fetchOptions,
  }: {
    force?: boolean;
    staleMs?: number;
    now?: Date;
    fetchOptions?: FetchIcsOptions;
  } = {},
): Promise<RefreshOutcome> {
  const prisma = getPrisma();
  const feed = await prisma.calendarFeed.findUnique({
    where: { id: feedId },
    select: {
      id: true,
      secretUrl: true,
      isEncrypted: true,
      etag: true,
      lastModified: true,
      fetchedAt: true,
      lastAttemptAt: true,
    },
  });
  if (!feed) {
    return "missing";
  }

  const nowMs = now.getTime();
  const stale = !feed.fetchedAt || nowMs - feed.fetchedAt.getTime() >= staleMs;
  if (!force && !stale) {
    return "fresh";
  }
  const sinceAttempt = feed.lastAttemptAt ? nowMs - feed.lastAttemptAt.getTime() : Infinity;
  // Forced: once a minute. Background: a failing feed is retried no more
  // often than the stale window.
  if (sinceAttempt < (force ? FORCED_REFRESH_MIN_INTERVAL_MS : Math.min(staleMs, OUTLOOK_STALE_MS))) {
    return "throttled";
  }

  const claimed = await prisma.calendarFeed.updateMany({
    where: {
      id: feed.id,
      OR: [
        { refreshLockedAt: null },
        { refreshLockedAt: { lt: new Date(nowMs - REFRESH_LOCK_MS) } },
      ],
    },
    data: { refreshLockedAt: now },
  });
  if (claimed.count === 0) {
    return "locked";
  }

  try {
    const url = readSecretUrl(feed);
    const hasCache = Boolean(feed.fetchedAt);
    const result = await fetchIcsFeed(url, {
      ...fetchOptions,
      etag: hasCache ? feed.etag : null,
      lastModified: hasCache ? feed.lastModified : null,
    });
    // Opportunistic re-encryption once a key has been configured.
    const reseal =
      !feed.isEncrypted && isEncryptionConfigured() ? sealSecretUrl(url) : null;

    if (result.status === "not-modified") {
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: {
          fetchedAt: now,
          lastAttemptAt: now,
          lastErrorCode: null,
          lastErrorStatus: null,
          refreshLockedAt: null,
          ...(reseal ?? {}),
        },
      });
      return "not-modified";
    }

    parseIcs(result.body); // NOT_ICS → keep the old cache
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: {
        icsBody: result.body,
        etag: result.etag,
        lastModified: result.lastModified,
        fetchedAt: now,
        lastAttemptAt: now,
        lastErrorCode: null,
        lastErrorStatus: null,
        refreshLockedAt: null,
        ...(reseal ?? {}),
      },
    });
    return "refreshed";
  } catch (error) {
    const code: IcsErrorCode = error instanceof IcsFetchError ? error.code : "NETWORK";
    const status = error instanceof IcsFetchError ? (error.status ?? null) : null;
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: {
        lastAttemptAt: now,
        lastErrorCode: code,
        lastErrorStatus: status,
        refreshLockedAt: null,
      },
    });
    return "failed";
  }
}

/** Refresh the caller's own feed (calendar mount / „Obnovit teď"). */
export async function refreshOwnOutlookFeed(
  user: FeedOwner,
  { force = false }: { force?: boolean } = {},
): Promise<RefreshOutcome> {
  const where = ownerWhere(user);
  if (!where) {
    return "missing";
  }
  const feed = await getPrisma().calendarFeed.findUnique({
    where: { organizationId_userId: where },
    select: { id: true },
  });
  if (!feed) {
    return "missing";
  }
  return refreshOutlookFeed(feed.id, { force });
}

/** Cron: refresh feeds whose cache is older than ~50 minutes. */
export async function refreshStaleOutlookFeeds({
  limit = 25,
  concurrency = 4,
  now = new Date(),
}: { limit?: number; concurrency?: number; now?: Date } = {}) {
  const threshold = new Date(now.getTime() - OUTLOOK_CRON_STALE_MS);
  const feeds = await getPrisma().calendarFeed.findMany({
    where: {
      OR: [{ fetchedAt: null }, { fetchedAt: { lt: threshold } }],
      AND: [{ OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: threshold } }] }],
    },
    orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }],
    take: limit,
    select: { id: true },
  });

  const summary = { checked: feeds.length, refreshed: 0, notModified: 0, failed: 0, skipped: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < feeds.length) {
      const feed = feeds[cursor];
      cursor += 1;
      const outcome = await refreshOutlookFeed(feed.id, {
        staleMs: OUTLOOK_CRON_STALE_MS,
      }).catch((): RefreshOutcome => "failed");
      if (outcome === "refreshed") {
        summary.refreshed += 1;
      } else if (outcome === "not-modified") {
        summary.notModified += 1;
      } else if (outcome === "failed") {
        summary.failed += 1;
      } else {
        summary.skipped += 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, feeds.length)) }, worker),
  );
  return summary;
}

// --- occurrences ------------------------------------------------------------------

// Parsing a big feed on every range change would be wasteful: keep a few
// parsed calendars in memory, keyed by feed + cache version.
const parsedCache = new Map<string, ParsedCalendar>();
const PARSED_CACHE_LIMIT = 20;

function rememberParsed(key: string, parsed: ParsedCalendar) {
  parsedCache.delete(key);
  parsedCache.set(key, parsed);
  while (parsedCache.size > PARSED_CACHE_LIMIT) {
    const oldest = parsedCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    parsedCache.delete(oldest);
  }
}

/** The caller's own Outlook occurrences within `range` (from the cache only). */
export async function getOutlookOccurrences(
  user: FeedOwner,
  range: { start: Date; end: Date },
): Promise<OutlookOccurrence[]> {
  const where = ownerWhere(user);
  if (!where) {
    return [];
  }
  const prisma = getPrisma();
  const head = await prisma.calendarFeed.findUnique({
    where: { organizationId_userId: where },
    select: { id: true, fetchedAt: true, updatedAt: true },
  });
  if (!head?.fetchedAt) {
    return [];
  }
  const key = `${head.id}:${head.fetchedAt.getTime()}:${head.updatedAt.getTime()}`;
  let parsed = parsedCache.get(key);
  if (!parsed) {
    const feed = await prisma.calendarFeed.findUnique({
      where: { id: head.id },
      select: { icsBody: true },
    });
    if (!feed?.icsBody) {
      return [];
    }
    try {
      parsed = parseIcs(feed.icsBody);
    } catch {
      return [];
    }
    // Drop older versions of the same feed.
    for (const cached of parsedCache.keys()) {
      if (cached.startsWith(`${head.id}:`)) {
        parsedCache.delete(cached);
      }
    }
    rememberParsed(key, parsed);
  }
  return expandIcsEvents(parsed, range);
}

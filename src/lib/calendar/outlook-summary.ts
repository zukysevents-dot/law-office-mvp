// What the UI may know about a user's Outlook (ICS) calendar connection.
// Pure + client-safe: never contains the secret URL or the cached feed.

export type OutlookFeedSummary = {
  connected: boolean;
  /** "outlook.office365.com/…/calendar.ics" — host + masked path only. */
  urlHint: string | null;
  /** Last successful download (ISO), null when never downloaded. */
  fetchedAtIso: string | null;
  /** The cache is older than the refresh threshold (the client refreshes it). */
  stale: boolean;
  /** Czech message of the last failed refresh, null when it succeeded. */
  errorMessage: string | null;
  /** The secret URL is stored encrypted. */
  encrypted: boolean;
  /** DATA_ENCRYPTION_KEY is configured on the server. */
  encryptionReady: boolean;
};

export const OUTLOOK_NOT_CONNECTED: OutlookFeedSummary = {
  connected: false,
  urlHint: null,
  fetchedAtIso: null,
  stale: false,
  errorMessage: null,
  encrypted: false,
  encryptionReady: false,
};

/** „1 událost", „3 události", „5 událostí" (Czech plural). */
export function formatEventCount(count: number): string {
  const abs = Math.abs(count);
  if (abs === 1) {
    return `${count} událost`;
  }
  if (abs >= 2 && abs <= 4) {
    return `${count} události`;
  }
  return `${count} událostí`;
}

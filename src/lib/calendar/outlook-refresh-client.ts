// Client side of POST /api/calendar/outlook/refresh. A plain fetch() — NOT a
// server action — so the (possibly slow) ICS download never sits in Next's
// one-at-a-time server-action queue in front of the calendar's event fetches.

import type { OutlookRefreshResponse } from "@/lib/calendar/outlook-summary";

export const OUTLOOK_REFRESH_ENDPOINT = "/api/calendar/outlook/refresh";

// One background refresh at a time per page (StrictMode mounts effects twice,
// and the calendar + settings panel may both ask): later callers share it.
let backgroundRefresh: Promise<OutlookRefreshResponse | null> | null = null;

async function postRefresh(force: boolean): Promise<OutlookRefreshResponse | null> {
  const response = await fetch(OUTLOOK_REFRESH_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!response.ok) {
    throw new Error(`Outlook refresh failed (${response.status})`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // e.g. a redirect to /login after the session expired.
    return null;
  }
  return (await response.json()) as OutlookRefreshResponse;
}

/**
 * Refresh the viewer's own Outlook feed. `force` = „Obnovit teď" (throttled
 * server-side to once a minute); otherwise only a stale cache is downloaded.
 */
export function requestOutlookRefresh(
  force: boolean,
): Promise<OutlookRefreshResponse | null> {
  if (force) {
    return postRefresh(true);
  }
  if (!backgroundRefresh) {
    backgroundRefresh = postRefresh(false).finally(() => {
      backgroundRefresh = null;
    });
  }
  return backgroundRefresh;
}

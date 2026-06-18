/**
 * Optional Microsoft Graph (app-only) client for really creating SharePoint folders.
 *
 * Used only when `isGraphConfigured()` is true; callers fall back to the
 * convention URL otherwise. Uses the OAuth client-credentials grant — no
 * interactive login required.
 */

import { getGraphConfig } from "@/lib/microsoft/config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const FETCH_TIMEOUT_MS = 15_000;

type GraphItem = { webUrl: string; folder?: unknown };

// Cache is keyed to the tenant+client so a config/tenant change forces a refetch.
let cachedToken: { value: string; expiresAt: number; key: string } | null = null;
// De-dupe concurrent token requests so N simultaneous provisions issue one POST.
let inflightToken: { key: string; promise: Promise<string> } | null = null;

async function getGraphToken(): Promise<string> {
  const config = getGraphConfig();
  if (!config) {
    throw new Error("Microsoft Graph není nakonfigurován (chybí MICROSOFT_* / SHAREPOINT_DRIVE_ID).");
  }

  const key = `${config.tenantId}:${config.clientId}`;

  // Reuse a still-valid token for the same config (60s safety margin).
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  if (inflightToken && inflightToken.key === key) {
    return inflightToken.promise;
  }

  const promise = (async () => {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      throw new Error(`Získání Microsoft Graph tokenu selhalo (${res.status}).`);
    }

    const data = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") {
      throw new Error("Neplatná odpověď tokenu z Microsoft Entra.");
    }

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      key,
    };
    return data.access_token;
  })();

  inflightToken = { key, promise };
  try {
    return await promise;
  } finally {
    if (inflightToken?.promise === promise) {
      inflightToken = null;
    }
  }
}

function encodePath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

/** Create one folder under `parentSegments`. Returns the created item, or null if it already exists (409). */
async function createFolder(
  driveId: string,
  token: string,
  parentSegments: string[],
  name: string,
): Promise<GraphItem | null> {
  const parentPath = encodePath(parentSegments);
  const url = parentPath
    ? `${GRAPH_BASE}/drives/${driveId}/root:/${parentPath}:/children`
    : `${GRAPH_BASE}/drives/${driveId}/root/children`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // 409 = an item with this name already exists; resolve it separately (it may be a file).
  if (res.status === 409) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Vytvoření složky "${name}" v SharePointu selhalo (${res.status}).`);
  }

  return (await res.json()) as GraphItem;
}

async function getFolderItem(
  driveId: string,
  token: string,
  segments: string[],
): Promise<GraphItem> {
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodePath(segments)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Načtení SharePoint složky selhalo (${res.status}).`);
  }

  return (await res.json()) as GraphItem;
}

/**
 * Ensure every folder in the path exists (creating missing ones), then return
 * the leaf folder's real `webUrl`. Throws if Graph is not configured, a call
 * fails, or the leaf name is taken by something that is not a folder.
 */
export async function ensureFolderPath(segments: string[]): Promise<string> {
  const config = getGraphConfig();
  if (!config) {
    throw new Error("Microsoft Graph není nakonfigurován.");
  }

  const token = await getGraphToken();

  const parentSegments: string[] = [];
  let leaf: GraphItem | null = null;
  for (const segment of segments) {
    leaf = await createFolder(config.driveId, token, parentSegments, segment);
    parentSegments.push(segment);
  }

  // A freshly created leaf returns its item directly (no extra round-trip, no
  // read-after-write consistency gap); a pre-existing one (409) is fetched.
  const item = leaf ?? (await getFolderItem(config.driveId, token, segments));

  if (!item.folder) {
    throw new Error("Cílová položka v SharePointu existuje, ale není složka.");
  }

  return item.webUrl;
}

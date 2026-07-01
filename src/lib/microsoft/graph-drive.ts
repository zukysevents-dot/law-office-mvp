/**
 * SharePoint drive operations over Microsoft Graph (app-only): resolve the site
 * drive, ensure a folder path exists, and upload a file. Builds on the Graph
 * client in `graph.ts` and the folder-naming convention in `sharepoint.ts`.
 *
 * Every entry point returns null when Graph or the SharePoint site URL is not
 * configured, so callers degrade to the URL-only convention. The URL/path
 * parsing helpers are pure + unit-tested; the rest is thin Graph I/O that can
 * only be validated against a real tenant.
 */

import { getSharepointConfig } from "@/lib/microsoft/config";
import { graphFetch, isGraphConfigured } from "@/lib/microsoft/graph";

export type SharepointSiteRef = { hostname: string; sitePath: string };

/**
 * Split a SharePoint site URL into the {hostname, server-relative path} Graph
 * needs for site lookup. Returns null for anything that isn't an http(s) URL.
 *   "https://contoso.sharepoint.com/sites/Law" → { hostname, sitePath: "/sites/Law" }
 *   "https://contoso.sharepoint.com"           → { hostname, sitePath: "" }
 */
export function parseSharepointSiteUrl(
  siteUrl: string,
): SharepointSiteRef | null {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const sitePath = url.pathname.replace(/\/+$/, "");
  return { hostname: url.hostname, sitePath: sitePath === "/" ? "" : sitePath };
}

/** Graph resource selector for a site: "/sites/{host}:{path}" (root site: "/sites/{host}"). */
export function graphSiteResource(ref: SharepointSiteRef): string {
  return ref.sitePath
    ? `/sites/${ref.hostname}:${ref.sitePath}`
    : `/sites/${ref.hostname}`;
}

/** Encode folder/file segments into a Graph path-addressable string. */
export function encodeDrivePath(segments: string[]): string {
  return segments
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Whether a real Graph upload is possible (both Graph creds + site URL set). */
export function isSharepointUploadConfigured(): boolean {
  return isGraphConfigured() && getSharepointConfig() !== null;
}

// --- Graph I/O --------------------------------------------------------------

async function graphJson(path: string): Promise<Record<string, unknown>> {
  const response = await graphFetch({ path });
  if (!response.ok) {
    throw new Error(`Microsoft Graph: požadavek selhal (HTTP ${response.status}).`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Read a required string field from a Graph response, with a clear error. */
function requireString(
  source: Record<string, unknown>,
  key: string,
  errorMessage: string,
): string {
  const value = source[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(errorMessage);
  }
  return value;
}

// Keyed by siteUrl so a reconfigured site never returns a stale drive id from a
// different library/tenant (a plain global string would survive the change).
let cachedDrive: { siteUrl: string; driveId: string } | null = null;

/** Resolve (and cache) the default document-library drive id for the site. */
async function resolveDriveId(): Promise<string | null> {
  const config = getSharepointConfig();
  if (!config || !isGraphConfigured()) {
    return null;
  }
  if (cachedDrive && cachedDrive.siteUrl === config.siteUrl) {
    return cachedDrive.driveId;
  }
  const ref = parseSharepointSiteUrl(config.siteUrl);
  if (!ref) {
    return null;
  }

  const site = await graphJson(graphSiteResource(ref));
  const siteId = requireString(
    site,
    "id",
    "Microsoft Graph: web SharePointu nenalezen.",
  );
  const drive = await graphJson(`/sites/${siteId}/drive`);
  const driveId = requireString(
    drive,
    "id",
    "Microsoft Graph: knihovna dokumentů nenalezena.",
  );
  cachedDrive = { siteUrl: config.siteUrl, driveId };
  return driveId;
}

/** Drop the cached drive id (tests / after a site reconfiguration). */
export function resetDriveCache(): void {
  cachedDrive = null;
}

/**
 * Ensure the folder path (relative to the library root) exists, creating any
 * missing segments idempotently. Returns the folder's SharePoint webUrl, or null
 * when the integration is not configured.
 */
export async function ensureSharepointFolder(
  segments: string[],
): Promise<string | null> {
  const driveId = await resolveDriveId();
  if (!driveId) {
    return null;
  }

  const invalid = "Microsoft Graph: neplatná odpověď při práci se složkou.";
  const root = await graphJson(`/drives/${driveId}/root`);
  let parentId = requireString(root, "id", invalid);
  let webUrl = requireString(root, "webUrl", invalid);
  const cumulative: string[] = [];

  for (const segment of segments) {
    cumulative.push(segment);
    const create = await graphFetch({
      method: "POST",
      path: `/drives/${driveId}/items/${parentId}/children`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: segment,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (create.ok) {
      const created = (await create.json()) as Record<string, unknown>;
      parentId = requireString(created, "id", invalid);
      webUrl = requireString(created, "webUrl", invalid);
    } else if (create.status === 409) {
      // Folder already exists — look it up by path to continue the descent.
      const existing = await graphJson(
        `/drives/${driveId}/root:/${encodeDrivePath(cumulative)}`,
      );
      parentId = requireString(existing, "id", invalid);
      webUrl = requireString(existing, "webUrl", invalid);
    } else {
      throw new Error(
        `Microsoft Graph: založení složky selhalo (HTTP ${create.status}).`,
      );
    }
  }

  return webUrl;
}

/**
 * Upload a file into the folder at `segments` (simple upload, ≤4 MB). Creates
 * the folder path first. Returns the uploaded file's webUrl, or null when the
 * integration is not configured.
 */
export async function uploadSharepointFile(
  segments: string[],
  filename: string,
  content: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string | null> {
  const driveId = await resolveDriveId();
  if (!driveId) {
    return null;
  }
  await ensureSharepointFolder(segments);

  const path = encodeDrivePath([...segments, filename]);
  const response = await graphFetch({
    method: "PUT",
    path: `/drives/${driveId}/root:/${path}:/content`,
    headers: { "Content-Type": contentType },
    body: content as BodyInit,
  });
  if (!response.ok) {
    throw new Error(
      `Microsoft Graph: nahrání souboru selhalo (HTTP ${response.status}).`,
    );
  }
  const uploaded = (await response.json()) as Record<string, unknown>;
  return typeof uploaded.webUrl === "string" ? uploaded.webUrl : null;
}

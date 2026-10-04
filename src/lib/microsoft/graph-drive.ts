/**
 * Operace nad knihovnou SharePointu přes Microsoft Graph (app-only): najít drive
 * webu, vypsat obsah složky, založit cestu, nahrát a smazat soubor. Staví na
 * transportu v `graph.ts` a na konvenci názvů v `sharepoint.ts`.
 *
 * Každý vstupní bod vrací null, když daná kancelář nemá SharePoint nakonfigurovaný,
 * takže volající degraduje na režim „jen URL". Parsování URL/cest jsou čisté
 * unit-testované helpery; zbytek je tenké Graph I/O ověřitelné jen proti reálnému
 * tenantovi.
 */

import {
  getSharepointConfigForOrg,
  type ResolvedSharepointConfig,
} from "@/lib/microsoft/config";
import { buildDriveIndex, type DriveEntry } from "@/lib/microsoft/drive-index";
import { graphFetch } from "@/lib/microsoft/graph";

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

/** Whether a real Graph call is possible for this org (site URL + Graph creds). */
export async function isSharepointUploadConfigured(
  organizationId: string | null | undefined,
): Promise<boolean> {
  return (await getSharepointConfigForOrg(organizationId)) !== null;
}

// --- Graph I/O --------------------------------------------------------------

async function graphJson(
  config: ResolvedSharepointConfig,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await graphFetch(config, { path });
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

// Klíčováno (údaje, siteUrl). Samotné siteUrl by na správnost stačilo (host
// SharePointu patří právě jednomu tenantovi), ale připojení údajů nic nestojí
// a odpadá tím potřeba o tom přemýšlet.
const driveCache = new Map<string, string>();

function driveCacheKey(config: ResolvedSharepointConfig): string {
  return `${config.tenantId}|${config.clientId}|${config.siteUrl}`;
}

/** Resolve (and cache) the default document-library drive id for the site. */
async function resolveDriveId(
  config: ResolvedSharepointConfig,
): Promise<string | null> {
  const key = driveCacheKey(config);
  const cached = driveCache.get(key);
  if (cached) {
    return cached;
  }
  const ref = parseSharepointSiteUrl(config.siteUrl);
  if (!ref) {
    return null;
  }

  const site = await graphJson(config, graphSiteResource(ref));
  const siteId = requireString(
    site,
    "id",
    "Microsoft Graph: web SharePointu nenalezen.",
  );
  const drive = await graphJson(config, `/sites/${siteId}/drive`);
  const driveId = requireString(
    drive,
    "id",
    "Microsoft Graph: knihovna dokumentů nenalezena.",
  );
  driveCache.set(key, driveId);
  return driveId;
}

/** Zahodí nacachovaná drive id (testy / po změně konfigurace webu). */
export function resetDriveCache(): void {
  driveCache.clear();
  indexCache.clear();
}

/** Resolve config + drive in one step; null = integrace pro tuto kancelář vypnutá. */
async function resolveTarget(
  organizationId: string | null | undefined,
): Promise<{ config: ResolvedSharepointConfig; driveId: string } | null> {
  const config = await getSharepointConfigForOrg(organizationId);
  if (!config) {
    return null;
  }
  const driveId = await resolveDriveId(config);
  if (!driveId) {
    return null;
  }
  return { config, driveId };
}

/**
 * Graph adresa položky podle cesty. Prázdná cesta = kořen knihovny, který má
 * jiný tvar URL než vnořená položka (`/root` vs `/root:/a/b:`).
 */
function itemResource(
  driveId: string,
  segments: string[],
  suffix: string,
): string {
  const path = encodeDrivePath(segments);
  return path
    ? `/drives/${driveId}/root:/${path}:${suffix}`
    : `/drives/${driveId}/root${suffix}`;
}

// --- Výpis obsahu složky ----------------------------------------------------

export type SharepointItem = {
  name: string;
  isFolder: boolean;
  size: number | null;
  lastModified: string | null;
  lastModifiedBy: string | null;
  webUrl: string | null;
  childCount: number | null;
};

export type SharepointListing = { items: SharepointItem[]; truncated: boolean };

// Kolik stránek po 200 položkách nejvýš načteme, než výpis označíme za zkrácený.
const MAX_LIST_PAGES = 5;

function mapDriveItem(raw: unknown): SharepointItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== "string" || name === "") {
    return null;
  }
  const folder = record.folder as Record<string, unknown> | undefined;
  const modifiedBy = (record.lastModifiedBy as Record<string, unknown> | undefined)
    ?.user as Record<string, unknown> | undefined;
  return {
    name,
    isFolder: Boolean(folder),
    size: typeof record.size === "number" ? record.size : null,
    lastModified:
      typeof record.lastModifiedDateTime === "string"
        ? record.lastModifiedDateTime
        : null,
    lastModifiedBy:
      typeof modifiedBy?.displayName === "string" ? modifiedBy.displayName : null,
    webUrl: typeof record.webUrl === "string" ? record.webUrl : null,
    childCount:
      folder && typeof folder.childCount === "number" ? folder.childCount : null,
  };
}

/**
 * Vypíše obsah složky (relativně ke kořeni knihovny). Vrací null, když kancelář
 * nemá integraci nakonfigurovanou; neexistující složka je prázdný výpis, ne chyba —
 * UI ty dva stavy rozlišuje.
 */
export async function listSharepointChildren(
  organizationId: string | null | undefined,
  segments: string[],
): Promise<SharepointListing | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }

  const items: SharepointItem[] = [];
  let path: string | null = `${itemResource(
    target.driveId,
    segments,
    "/children",
  )}?$select=name,folder,file,size,lastModifiedDateTime,lastModifiedBy,webUrl&$top=200`;
  let truncated = false;

  for (let page = 0; page < MAX_LIST_PAGES && path; page += 1) {
    const response = await graphFetch(target.config, { path });
    if (response.status === 404) {
      // Složka zatím neexistuje (např. spis bez založené složky) — prázdno.
      return { items: [], truncated: false };
    }
    if (!response.ok) {
      throw new Error(
        `Microsoft Graph: výpis složky selhal (HTTP ${response.status}).`,
      );
    }
    const body = (await response.json()) as Record<string, unknown>;
    const value = Array.isArray(body.value) ? body.value : [];
    for (const raw of value) {
      const item = mapDriveItem(raw);
      if (item) {
        items.push(item);
      }
    }
    const next = body["@odata.nextLink"];
    path = typeof next === "string" ? next : null;
    if (path && page === MAX_LIST_PAGES - 1) {
      truncated = true;
    }
  }

  // Graph $orderby složky nepreferuje — řadíme sami: složky první, pak česky.
  items.sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "cs");
  });

  return { items, truncated };
}

/**
 * webUrl složky (pro „Otevřít v SharePointu"). null = integrace vypnutá nebo
 * složka neexistuje.
 */
export async function getSharepointFolderWebUrl(
  organizationId: string | null | undefined,
  segments: string[],
): Promise<string | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }
  const response = await graphFetch(target.config, {
    path: `${itemResource(target.driveId, segments, "")}?$select=webUrl`,
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, unknown>;
  return typeof body.webUrl === "string" ? body.webUrl : null;
}

// --- Index celé knihovny (filtry napříč podsložkami) ------------------------

export type SharepointDriveIndex = {
  entries: DriveEntry[];
  /** Knihovna je větší, než kolik se načítá — výsledky filtrů nejsou úplné. */
  truncated: boolean;
  loadedAt: Date;
};

// Delta stránky po 500 položkách; 40 stránek = 20 000 položek, víc malá
// kancelář v jedné knihovně mít nebude.
const MAX_DELTA_PAGES = 40;
const INDEX_TTL_MS = 2 * 60 * 1000;
const indexCache = new Map<
  string,
  { expiresAt: number; promise: Promise<SharepointDriveIndex> }
>();

async function crawlDrive(
  config: ResolvedSharepointConfig,
  driveId: string,
): Promise<SharepointDriveIndex> {
  const raw: unknown[] = [];
  let path: string | null =
    `/drives/${driveId}/root/delta?$select=id,name,folder,file,size,root,deleted,` +
    `lastModifiedDateTime,lastModifiedBy,webUrl,parentReference&$top=500`;
  let truncated = false;

  for (let page = 0; page < MAX_DELTA_PAGES && path; page += 1) {
    const response = await graphFetch(config, { path });
    if (!response.ok) {
      throw new Error(
        `Microsoft Graph: načtení knihovny selhalo (HTTP ${response.status}).`,
      );
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (Array.isArray(body.value)) {
      raw.push(...body.value);
    }
    const next = body["@odata.nextLink"];
    path = typeof next === "string" ? next : null;
    if (path && page === MAX_DELTA_PAGES - 1) {
      truncated = true;
    }
  }

  return { entries: buildDriveIndex(raw), truncated, loadedAt: new Date() };
}

/**
 * Plochý index všech položek knihovny (s cestami), krátce cachovaný v paměti
 * procesu. Souběžné požadavky sdílí jedno stahování. null = integrace vypnutá.
 */
export async function getSharepointDriveIndex(
  organizationId: string | null | undefined,
  options: { refresh?: boolean } = {},
): Promise<SharepointDriveIndex | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }
  const key = `${driveCacheKey(target.config)}|${target.driveId}`;
  const cached = indexCache.get(key);
  if (cached && cached.expiresAt > Date.now() && !options.refresh) {
    return cached.promise;
  }
  const promise = crawlDrive(target.config, target.driveId);
  indexCache.set(key, { expiresAt: Date.now() + INDEX_TTL_MS, promise });
  // Neúspěch se necachuje — další požadavek to zkusí znovu.
  promise.catch(() => {
    if (indexCache.get(key)?.promise === promise) {
      indexCache.delete(key);
    }
  });
  return promise;
}

/** Po zápisu (upload, nová složka, smazání) ať filtry hned vidí změnu. */
export function invalidateSharepointDriveIndex(): void {
  indexCache.clear();
}

// --- Zápis ------------------------------------------------------------------

/** Založí chybějící segmenty cesty; vrací webUrl nejhlubší složky. */
async function ensureFolder(
  config: ResolvedSharepointConfig,
  driveId: string,
  segments: string[],
): Promise<string> {
  const invalid = "Microsoft Graph: neplatná odpověď při práci se složkou.";
  const root = await graphJson(config, `/drives/${driveId}/root`);
  let parentId = requireString(root, "id", invalid);
  let webUrl = requireString(root, "webUrl", invalid);
  const cumulative: string[] = [];

  for (const segment of segments) {
    cumulative.push(segment);
    const create = await graphFetch(config, {
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
        config,
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
 * Ensure the folder path (relative to the library root) exists, creating any
 * missing segments idempotently. Returns the folder's SharePoint webUrl, or null
 * when the integration is not configured.
 */
export async function ensureSharepointFolder(
  organizationId: string | null | undefined,
  segments: string[],
): Promise<string | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }
  return ensureFolder(target.config, target.driveId, segments);
}

/**
 * Upload a file into the folder at `segments` (simple upload, ≤4 MB). Creates
 * the folder path first. Returns the uploaded file's webUrl, or null when the
 * integration is not configured.
 */
export async function uploadSharepointFile(
  organizationId: string | null | undefined,
  segments: string[],
  filename: string,
  content: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }
  await ensureFolder(target.config, target.driveId, segments);

  const path = encodeDrivePath([...segments, filename]);
  const response = await graphFetch(target.config, {
    method: "PUT",
    path: `/drives/${target.driveId}/root:/${path}:/content`,
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

/**
 * Smaže položku (soubor i složku) na dané cestě. Adresuje se CESTOU, ne Graph id —
 * cestu sestavuje server z kořene spisu, takže z ní nejde uniknout do cizí složky.
 * Vrací false, když položka neexistuje; null, když integrace není nakonfigurovaná.
 */
export async function deleteSharepointItemByPath(
  organizationId: string | null | undefined,
  segments: string[],
): Promise<boolean | null> {
  const target = await resolveTarget(organizationId);
  if (!target) {
    return null;
  }
  if (segments.length === 0) {
    // Pojistka: prázdná cesta = kořen knihovny. Ten se přes tuhle cestu nemaže.
    throw new Error("Microsoft Graph: cesta k mazané položce je prázdná.");
  }
  const response = await graphFetch(target.config, {
    method: "DELETE",
    path: itemResource(target.driveId, segments, "/"),
  });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok && response.status !== 204) {
    throw new Error(
      `Microsoft Graph: smazání položky selhalo (HTTP ${response.status}).`,
    );
  }
  return true;
}

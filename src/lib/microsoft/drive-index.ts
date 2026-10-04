/**
 * Index celé knihovny SharePointu pro průzkumník složek a jeho filtry.
 *
 * Graph `delta` vrací plochý seznam všech položek knihovny, ale v delta odpovědi
 * chybí `parentReference.path` — cesty se proto skládají tady, přes řetěz
 * `parentReference.id`. Všechno v tomhle souboru je čisté (bez I/O) a
 * unit-testované; samotné stahování je v `graph-drive.ts`.
 */

export type DriveEntry = {
  id: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  lastModified: string | null;
  lastModifiedBy: string | null;
  webUrl: string | null;
  childCount: number | null;
  /** Segmenty NADŘAZENÉ složky relativně ke kořeni knihovny ([] = kořen). */
  parentSegments: string[];
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" ? (value as RawRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Z delta položek poskládá záznamy s cestou. Kořen knihovny (facet `root`) a
 * smazané položky (facet `deleted`) se vynechávají; položka, jejíž předek v
 * datech chybí (např. zkrácený výpis), se vynechá taky — radši nic než špatná
 * cesta.
 */
export function buildDriveIndex(rawItems: unknown[]): DriveEntry[] {
  type Node = { id: string; name: string; parentId: string | null; raw: RawRecord };
  const nodes = new Map<string, Node>();
  let rootId: string | null = null;

  for (const raw of rawItems) {
    const record = asRecord(raw);
    const id = asString(record?.id);
    if (!record || !id || record.deleted) {
      continue;
    }
    if (record.root) {
      rootId = id;
      continue;
    }
    const name = asString(record.name);
    if (!name) {
      continue;
    }
    const parentId = asString(asRecord(record.parentReference)?.id);
    nodes.set(id, { id, name, parentId, raw: record });
  }

  const pathCache = new Map<string, string[] | null>();
  function folderSegments(folderId: string | null, depth = 0): string[] | null {
    if (!folderId || depth > 64) {
      return null;
    }
    if (folderId === rootId) {
      return [];
    }
    if (pathCache.has(folderId)) {
      return pathCache.get(folderId) ?? null;
    }
    const node = nodes.get(folderId);
    const parent = node ? folderSegments(node.parentId, depth + 1) : null;
    const segments = node && parent ? [...parent, node.name] : null;
    pathCache.set(folderId, segments);
    return segments;
  }

  const entries: DriveEntry[] = [];
  for (const node of nodes.values()) {
    const parentSegments = folderSegments(node.parentId);
    if (!parentSegments) {
      continue;
    }
    const folder = asRecord(node.raw.folder);
    const modifiedBy = asRecord(asRecord(node.raw.lastModifiedBy)?.user);
    entries.push({
      id: node.id,
      name: node.name,
      isFolder: Boolean(folder),
      size: typeof node.raw.size === "number" ? node.raw.size : null,
      lastModified: asString(node.raw.lastModifiedDateTime),
      lastModifiedBy: asString(modifiedBy?.displayName),
      webUrl: asString(node.raw.webUrl),
      childCount:
        folder && typeof folder.childCount === "number" ? folder.childCount : null,
      parentSegments,
    });
  }
  return entries;
}

// --- Filtry -----------------------------------------------------------------

export const MODIFIED_PRESETS = {
  any: { label: "Kdykoli", days: null },
  "1d": { label: "Posledních 24 hodin", days: 1 },
  "7d": { label: "Posledních 7 dní", days: 7 },
  "30d": { label: "Posledních 30 dní", days: 30 },
  "90d": { label: "Posledních 90 dní", days: 90 },
  "365d": { label: "Poslední rok", days: 365 },
  custom: { label: "Vlastní rozsah", days: null },
} as const;

export type ModifiedPreset = keyof typeof MODIFIED_PRESETS;

export const ITEM_KINDS = {
  all: "Vše",
  files: "Jen soubory",
  folders: "Jen složky",
} as const;

export type ItemKind = keyof typeof ITEM_KINDS;

export const SORT_ORDERS = {
  name: "Název (A–Z)",
  modified: "Naposledy změněné",
  size: "Velikost",
} as const;

export type SortOrder = keyof typeof SORT_ORDERS;

export type ExplorerFilters = {
  /** Část názvu souboru/složky. */
  q: string;
  /** Část názvu některé nadřazené složky (relativně k prohlížené složce). */
  folder: string;
  modified: ModifiedPreset;
  /** YYYY-MM-DD, jen pro `modified=custom`. */
  from: string | null;
  to: string | null;
  kind: ItemKind;
  sort: SortOrder;
};

type RawParams = Record<string, string | string[] | undefined>;

function param(params: RawParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isoDay(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function pick<T extends string>(value: string, allowed: Record<T, unknown>, fallback: T): T {
  return value in allowed ? (value as T) : fallback;
}

export function parseExplorerFilters(params: RawParams): ExplorerFilters {
  const from = isoDay(param(params, "from"));
  const to = isoDay(param(params, "to"));
  let modified = pick<ModifiedPreset>(param(params, "modified"), MODIFIED_PRESETS, "any");
  // Vyplněné datum bez zvoleného rozsahu = uživatel chtěl vlastní rozsah.
  if (modified === "any" && (from || to)) {
    modified = "custom";
  }
  return {
    q: param(params, "q").slice(0, 200),
    folder: param(params, "folder").slice(0, 200),
    modified,
    from: modified === "custom" ? from : null,
    to: modified === "custom" ? to : null,
    kind: pick<ItemKind>(param(params, "kind"), ITEM_KINDS, "all"),
    sort: pick<SortOrder>(param(params, "sort"), SORT_ORDERS, "name"),
  };
}

/** Filtrují se položky napříč podsložkami (jinak se jen řadí aktuální složka). */
export function hasActiveFilters(filters: ExplorerFilters): boolean {
  return (
    filters.q !== "" ||
    filters.folder !== "" ||
    filters.modified !== "any" ||
    filters.kind !== "all"
  );
}

/** Porovnání bez ohledu na velikost písmen a diakritiku („smlouvy" najde „Smlouvy", „navrh" najde „Návrh"). */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs");
}

/** Časové okno [od, do) v ms; null = bez omezení. Vlastní „do" je včetně celého dne. */
export function modifiedWindow(
  filters: ExplorerFilters,
  now: Date,
): { from: number | null; to: number | null } {
  if (filters.modified === "custom") {
    // Datumy z formuláře jsou dny v české časové zóně; půlnoc UTC je dostatečně
    // přesná a hlavně předvídatelná.
    const from = filters.from ? Date.parse(`${filters.from}T00:00:00Z`) : null;
    const to = filters.to ? Date.parse(`${filters.to}T00:00:00Z`) + 86_400_000 : null;
    return { from, to };
  }
  const days = MODIFIED_PRESETS[filters.modified].days;
  return {
    from: days === null ? null : now.getTime() - days * 86_400_000,
    to: null,
  };
}

function startsWithSegments(segments: string[], prefix: string[]): boolean {
  return prefix.every((segment, index) => segments[index] === segment);
}

export function sortEntries<T extends Pick<DriveEntry, "name" | "isFolder" | "lastModified" | "size">>(
  entries: T[],
  sort: SortOrder,
): T[] {
  const time = (entry: T) => (entry.lastModified ? Date.parse(entry.lastModified) : 0);
  return [...entries].sort((a, b) => {
    if (sort === "modified") {
      return time(b) - time(a) || a.name.localeCompare(b.name, "cs");
    }
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    if (sort === "size") {
      return (b.size ?? 0) - (a.size ?? 0) || a.name.localeCompare(b.name, "cs");
    }
    return a.name.localeCompare(b.name, "cs");
  });
}

/**
 * Vybere z indexu položky pod složkou `scope` (rekurzivně) podle filtrů.
 * Filtr `folder` se porovnává jen se složkami POD `scope` — název prohlížené
 * složky samotné by jinak vyhověl úplně všemu.
 */
export function filterDriveEntries(
  entries: DriveEntry[],
  scope: string[],
  filters: ExplorerFilters,
  now: Date,
): DriveEntry[] {
  const q = normalizeForSearch(filters.q);
  const folder = normalizeForSearch(filters.folder);
  const window = modifiedWindow(filters, now);

  const matches = entries.filter((entry) => {
    if (!startsWithSegments(entry.parentSegments, scope)) {
      return false;
    }
    if (filters.kind === "files" && entry.isFolder) {
      return false;
    }
    if (filters.kind === "folders" && !entry.isFolder) {
      return false;
    }
    if (q && !normalizeForSearch(entry.name).includes(q)) {
      return false;
    }
    if (folder) {
      const ancestors = entry.parentSegments.slice(scope.length);
      if (!ancestors.some((name) => normalizeForSearch(name).includes(folder))) {
        return false;
      }
    }
    if (window.from !== null || window.to !== null) {
      const modified = entry.lastModified ? Date.parse(entry.lastModified) : NaN;
      if (Number.isNaN(modified)) {
        return false;
      }
      if (window.from !== null && modified < window.from) {
        return false;
      }
      if (window.to !== null && modified >= window.to) {
        return false;
      }
    }
    return true;
  });

  return sortEntries(matches, filters.sort);
}

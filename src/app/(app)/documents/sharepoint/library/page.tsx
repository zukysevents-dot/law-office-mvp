import {
  ChevronRight,
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  filterDriveEntries,
  hasActiveFilters,
  ITEM_KINDS,
  MODIFIED_PRESETS,
  parseExplorerFilters,
  SORT_ORDERS,
  sortEntries,
  type ExplorerFilters,
} from "@/lib/microsoft/drive-index";
import {
  getSharepointDriveIndex,
  getSharepointFolderWebUrl,
  isSharepointUploadConfigured,
  listSharepointChildren,
} from "@/lib/microsoft/graph-drive";
import { formatRelativePath, parseRelativePath } from "@/lib/microsoft/sharepoint";
import { canViewAllLegalData } from "@/lib/permissions";
import { cn, isSafeHttpUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Víc řádků výsledků filtru nemá smysl renderovat — stačí zúžit filtr.
const MAX_RESULTS = 500;

type Row = {
  key: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  lastModified: string | null;
  lastModifiedBy: string | null;
  webUrl: string | null;
  childCount: number | null;
  /** Segmenty nadřazené složky (relativně ke kořeni knihovny). */
  parentSegments: string[];
};

/** Jedna úroveň stromu: složka cesty a její podsložky. */
type TreeLevel = { segments: string[]; folders: string[] };

type Data = {
  allowed: boolean;
  configured: boolean;
  tree: TreeLevel[];
  rows: Row[];
  totalMatches: number;
  truncated: boolean;
  folderWebUrl: string | null;
  indexLoadedAt: Date | null;
  error: string | null;
};

const EMPTY: Data = {
  allowed: false,
  configured: false,
  tree: [],
  rows: [],
  totalMatches: 0,
  truncated: false,
  folderWebUrl: null,
  indexLoadedAt: null,
  error: null,
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Odkaz do průzkumníku; parametry (filtry) jen ty, které se mají zachovat. */
function libraryHref(
  segments: string[],
  query: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (segments.length > 0) {
    params.set("path", formatRelativePath(segments));
  }
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return `/documents/sharepoint/library${search ? `?${search}` : ""}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "SharePoint se nepodařilo načíst.";
}

function FileIcon({ name, isFolder }: { name: string; isFolder: boolean }) {
  const className = "h-4 w-4 shrink-0";
  if (isFolder) {
    return <Folder className={cn(className, "text-amber-600")} aria-hidden="true" />;
  }
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xls", "xlsx", "xlsm", "csv", "ods"].includes(extension)) {
    return <FileSpreadsheet className={cn(className, "text-emerald-700")} aria-hidden="true" />;
  }
  if (["doc", "docx", "pdf", "txt", "rtf", "odt", "ppt", "pptx", "msg", "eml"].includes(extension)) {
    return <FileText className={cn(className, "text-sky-700")} aria-hidden="true" />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "tif", "tiff"].includes(extension)) {
    return <FileImage className={cn(className, "text-violet-700")} aria-hidden="true" />;
  }
  if (["zip", "rar", "7z", "zfo"].includes(extension)) {
    return <FileArchive className={cn(className, "text-stone-600")} aria-hidden="true" />;
  }
  return <File className={cn(className, "text-stone-500")} aria-hidden="true" />;
}

export default async function SharepointLibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawPath = Array.isArray(params.path) ? params.path[0] : params.path;
  // Cesta z URL projde stejným filtrem jako v prohlížeči spisů (žádné "..").
  const segments = parseRelativePath(rawPath);
  const filters = parseExplorerFilters(params);
  const filtering = hasActiveFilters(filters);
  const refresh = params.refresh === "1";

  const result = await safeQuery<Data>(EMPTY, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    // Graph běží s aplikačním oprávněním a vidí CELOU knihovnu, ne jen spisy
    // uživatele — proto celou knihovnu smí procházet jen ten, kdo vidí všechna
    // právní data. Ostatní procházejí složky svých spisů.
    if (!canViewAllLegalData(currentUser)) {
      return EMPTY;
    }
    const organizationId = currentUser.organizationId;
    if (!(await isSharepointUploadConfigured(organizationId))) {
      return { ...EMPTY, allowed: true };
    }

    // Strom: podsložky kořene a každé složky na aktuální cestě (paralelně).
    const prefixes = segments.map((_, index) => segments.slice(0, index + 1));
    const levelsPromise = Promise.all(
      [[], ...prefixes].map((prefix) =>
        listSharepointChildren(organizationId, prefix).then((listing) => ({
          segments: prefix,
          listing,
        })),
      ),
    );

    try {
      const [levels, folderWebUrl] = await Promise.all([
        levelsPromise,
        getSharepointFolderWebUrl(organizationId, segments),
      ]);
      const tree = levels.map((level) => ({
        segments: level.segments,
        folders: (level.listing?.items ?? [])
          .filter((item) => item.isFolder)
          .map((item) => item.name),
      }));

      if (!filtering) {
        const current = levels[levels.length - 1]?.listing;
        const rows = sortEntries(current?.items ?? [], filters.sort).map((item) => ({
          ...item,
          key: item.name,
          parentSegments: segments,
        }));
        return {
          ...EMPTY,
          allowed: true,
          configured: true,
          tree,
          rows,
          totalMatches: rows.length,
          truncated: current?.truncated ?? false,
          folderWebUrl,
        };
      }

      const index = await getSharepointDriveIndex(organizationId, { refresh });
      const matches = filterDriveEntries(index?.entries ?? [], segments, filters, new Date());
      return {
        ...EMPTY,
        allowed: true,
        configured: true,
        tree,
        rows: matches.slice(0, MAX_RESULTS).map((entry) => ({ ...entry, key: entry.id })),
        totalMatches: matches.length,
        truncated: index?.truncated ?? false,
        folderWebUrl,
        indexLoadedAt: index?.loadedAt ?? null,
      };
    } catch (cause) {
      return { ...EMPTY, allowed: true, configured: true, error: errorMessage(cause) };
    }
  });

  const data = result.data ?? EMPTY;
  const currentName = segments.at(-1) ?? "Knihovna dokumentů";
  const folderUrl = isSafeHttpUrl(data.folderWebUrl) ? data.folderWebUrl : null;

  return (
    <>
      <PageHeader
        title="Knihovna SharePointu"
        description="Složky a soubory tak, jak jsou v SharePointu. Kliknutím na soubor ho otevřete přímo v SharePointu."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/documents/sharepoint" variant="ghost">
              Složky spisů
            </ButtonLink>
            {folderUrl ? (
              <a
                href={folderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0e1822] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#16242f]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Otevřít v SharePointu
              </a>
            ) : null}
          </div>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.allowed ? (
        <Section title="Celou knihovnu vidí jen partner nebo administrátor">
          <p className="text-sm text-stone-600">
            Soubory svých spisů najdete v přehledu{" "}
            <Link href="/documents/sharepoint" className="font-medium underline">
              Složky spisů
            </Link>
            .
          </p>
        </Section>
      ) : null}

      {data.allowed && !data.configured ? (
        <Section title="SharePoint není připojený">
          <p className="text-sm text-stone-600">
            Pro procházení knihovny je potřeba nastavit web SharePointu a
            přihlašovací údaje Microsoft Graph.
          </p>
          <ButtonLink href="/settings/sharepoint" variant="secondary" className="mt-3">
            Nastavit připojení
          </ButtonLink>
        </Section>
      ) : null}

      {data.allowed && data.configured ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <Section title="Složky" className="lg:sticky lg:top-4 lg:self-start">
            <nav aria-label="Strom složek" className="max-h-[70vh] overflow-y-auto text-sm">
              <Link
                href={libraryHref([], { sort: filters.sort })}
                aria-current={segments.length === 0 ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#F4F7F8]",
                  segments.length === 0 && "bg-[#E8F6F6] font-semibold",
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                Knihovna dokumentů
              </Link>
              <FolderTree tree={data.tree} level={0} current={segments} sort={filters.sort} />
            </nav>
          </Section>

          <div className="grid min-w-0 gap-4">
            <nav
              aria-label="Cesta ve složce"
              className="flex flex-wrap items-center gap-1 text-sm text-stone-600"
            >
              <Link href={libraryHref([])} className="font-medium text-emerald-950 hover:underline">
                Knihovna dokumentů
              </Link>
              {segments.map((segment, index) => (
                <span key={`${segment}-${index}`} className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {index === segments.length - 1 ? (
                    <span className="font-medium text-stone-950">{segment}</span>
                  ) : (
                    <Link
                      href={libraryHref(segments.slice(0, index + 1))}
                      className="text-emerald-950 hover:underline"
                    >
                      {segment}
                    </Link>
                  )}
                </span>
              ))}
            </nav>

            <Section title="Filtry">
              <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {segments.length > 0 ? (
                  <input type="hidden" name="path" value={formatRelativePath(segments)} />
                ) : null}
                <Field label="Název souboru nebo složky">
                  <TextInput type="search" name="q" defaultValue={filters.q} placeholder="Např. smlouva" />
                </Field>
                <Field label="Ve složce s názvem">
                  <TextInput
                    type="search"
                    name="folder"
                    defaultValue={filters.folder}
                    placeholder="Např. Korespondence"
                  />
                </Field>
                <Field label="Změněno">
                  <SelectInput name="modified" defaultValue={filters.modified}>
                    {Object.entries(MODIFIED_PRESETS).map(([value, preset]) => (
                      <option key={value} value={value}>
                        {preset.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Typ">
                  <SelectInput name="kind" defaultValue={filters.kind}>
                    {Object.entries(ITEM_KINDS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Změněno od (vlastní rozsah)">
                  <TextInput type="date" name="from" defaultValue={filters.from ?? ""} />
                </Field>
                <Field label="Změněno do (vlastní rozsah)">
                  <TextInput type="date" name="to" defaultValue={filters.to ?? ""} />
                </Field>
                <Field label="Řazení">
                  <SelectInput name="sort" defaultValue={filters.sort}>
                    {Object.entries(SORT_ORDERS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="submit">Filtrovat</Button>
                  <ButtonLink href={libraryHref(segments)} variant="ghost">
                    Zrušit
                  </ButtonLink>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-stone-600">Rychle:</span>
                {(["1d", "7d", "30d"] as const).map((preset) => (
                  <Link
                    key={preset}
                    href={libraryHref(segments, {
                      ...filters,
                      from: null,
                      to: null,
                      modified: preset,
                      sort: "modified",
                    })}
                    className={cn(
                      "rounded-full border border-[#dce4e8] px-3 py-1 hover:bg-[#F4F7F8]",
                      filters.modified === preset && "border-[#17A2A2] bg-[#E8F6F6] font-medium",
                    )}
                  >
                    {MODIFIED_PRESETS[preset].label}
                  </Link>
                ))}
              </div>
              {filtering ? (
                <p className="mt-3 text-sm text-stone-600">
                  Hledá se ve složce „{currentName}“ a všech jejích podsložkách.
                  {data.indexLoadedAt ? (
                    <>
                      {" "}Načteno {formatDateTime(data.indexLoadedAt)}.{" "}
                      <Link
                        href={libraryHref(segments, { ...filters, refresh: "1" })}
                        className="inline-flex items-center gap-1 font-medium text-emerald-950 hover:underline"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Načíst znovu
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
            </Section>

            {data.error ? (
              <Section className="border-amber-300 bg-amber-50">
                <p className="text-sm text-amber-900">{data.error}</p>
              </Section>
            ) : null}

            <Section
              title={
                filtering
                  ? `Výsledky (${data.totalMatches})`
                  : `Obsah složky „${currentName}“`
              }
            >
              {data.rows.length > 0 ? (
                <div className="table-scroll">
                  <table className="w-max min-w-full">
                    <thead>
                      <tr>
                        <th>Název</th>
                        {filtering ? <th>Umístění</th> : null}
                        <th>Změněno</th>
                        <th>Upravil</th>
                        <th>Velikost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => {
                        const fileUrl = isSafeHttpUrl(row.webUrl) ? row.webUrl : null;
                        const folderSegments = [...row.parentSegments, row.name];
                        return (
                          <tr key={row.key}>
                            <td className="font-medium text-stone-950">
                              <span className="inline-flex items-center gap-2">
                                <FileIcon name={row.name} isFolder={row.isFolder} />
                                {row.isFolder ? (
                                  <Link
                                    href={libraryHref(folderSegments, { sort: filters.sort })}
                                    className="hover:underline"
                                  >
                                    {row.name}
                                  </Link>
                                ) : fileUrl ? (
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Otevřít v SharePointu"
                                    className="inline-flex items-center gap-1 hover:underline"
                                  >
                                    {row.name}
                                    <ExternalLink className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                                    <span className="sr-only">(otevře se v SharePointu)</span>
                                  </a>
                                ) : (
                                  <span>{row.name}</span>
                                )}
                              </span>
                            </td>
                            {filtering ? (
                              <td className="text-sm">
                                <Link
                                  href={libraryHref(row.parentSegments)}
                                  className="text-emerald-950 hover:underline"
                                >
                                  {row.parentSegments.length > 0
                                    ? row.parentSegments.join(" / ")
                                    : "Knihovna dokumentů"}
                                </Link>
                              </td>
                            ) : null}
                            <td>{formatDateTime(row.lastModified)}</td>
                            <td>{row.lastModifiedBy ?? "—"}</td>
                            <td>
                              {row.isFolder
                                ? row.childCount === null
                                  ? "—"
                                  : `${row.childCount} položek`
                                : formatBytes(row.size)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>
                  {filtering
                    ? "Filtru neodpovídá žádný soubor ani složka."
                    : "Složka je prázdná."}
                </EmptyState>
              )}

              {data.totalMatches > data.rows.length ? (
                <p className="mt-3 text-sm text-amber-900">
                  Zobrazeno prvních {data.rows.length} z {data.totalMatches} výsledků — zužte filtr.
                </p>
              ) : null}
              {data.truncated ? (
                <p className="mt-3 text-sm text-amber-900">
                  Knihovna obsahuje víc položek, než se sem načítá. Zbytek
                  otevřete přímo v SharePointu.
                </p>
              ) : null}
            </Section>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Strom složek: každá úroveň ukáže podsložky, rozbalená je jen ta na cestě. */
function FolderTree({
  tree,
  level,
  current,
  sort,
}: {
  tree: TreeLevel[];
  level: number;
  current: string[];
  sort: ExplorerFilters["sort"];
}) {
  const node = tree[level];
  if (!node || node.folders.length === 0) {
    return null;
  }
  return (
    <ul className="ml-3 border-l border-[#dce4e8] pl-2">
      {node.folders.map((name) => {
        const segments = [...node.segments, name];
        const onPath = current[level] === name && current.length > level;
        const isCurrent = onPath && current.length === level + 1;
        return (
          <li key={name}>
            <Link
              href={libraryHref(segments, { sort })}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#F4F7F8]",
                isCurrent && "bg-[#E8F6F6] font-semibold",
                onPath && !isCurrent && "font-medium",
              )}
            >
              {onPath ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span className="truncate">{name}</span>
            </Link>
            {onPath ? (
              <FolderTree tree={tree} level={level + 1} current={current} sort={sort} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

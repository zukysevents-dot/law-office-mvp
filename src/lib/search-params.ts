export type SearchParamValue = string | string[] | undefined;

// Normalize a Next.js searchParams entry (which may be a string, an array, or
// undefined) to a single string.
export function firstParam(
  params: Record<string, SearchParamValue>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

// Serialize a flat filter map into a query string, dropping empty values. Used
// by billing and report export/navigation links.
export function filterQuery(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  return params.toString();
}

// Parse a YYYY-MM-DD filter value into a UTC day boundary. Returns undefined for
// empty or malformed input so a bad query string can't throw a Prisma error
// (which would surface as a misleading 503 / "database not ready" notice).
export function parseDateBoundary(
  value: string,
  endOfDay: boolean,
): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value}T${time}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Stable React key for a GET filter form, derived from the current URL query.
// Filter forms are uncontrolled (defaultValue) and the matter cascade keeps its
// own state, so a soft navigation to a different query (e.g. "Zrušit filtry")
// would otherwise keep showing the old selections and silently re-apply them on
// the next submit. Keying the form on the query remounts it with fresh values.
export function filterFormKey(
  params: Record<string, SearchParamValue>,
  ignore: readonly string[] = [],
): string {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(params)) {
    if (ignore.includes(key) || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) {
        entries.push([key, item]);
      }
    }
  }
  entries.sort(([a, av], [b, bv]) =>
    a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1,
  );
  return new URLSearchParams(entries).toString() || "all";
}

// Query parametry, které jen otevírají dialog nového výkazu práce (stránka
// výkazů: new / hours / duplicate, úkoly: logWork). Po uložení se z cílové
// adresy odstraní, aby redirect dialog znovu neotevřel.
export const WORK_LOG_DIALOG_PARAMS = ["logWork", "new", "hours", "duplicate"] as const;

// Interní cesta (`/tasks?x=1#a`) bez dialogových parametrů; hash zůstává.
export function stripDialogParams(
  path: string,
  params: readonly string[] = WORK_LOG_DIALOG_PARAMS,
): string {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) {
    return path;
  }
  const pathname = withoutHash.slice(0, queryIndex);
  const query = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  for (const key of params) {
    query.delete(key);
  }
  const rest = query.toString();
  return `${pathname}${rest ? `?${rest}` : ""}${hash}`;
}

// Aktuální URL stránky (pathname + query z searchParams) bez vybraných
// parametrů — pro closeHref/returnTo dialogů otevřených přes URL.
export function hrefWithout(
  pathname: string,
  params: Record<string, SearchParamValue>,
  drop: readonly string[],
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (drop.includes(key) || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    query.set(key, value);
  }
  const rest = query.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

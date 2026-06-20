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

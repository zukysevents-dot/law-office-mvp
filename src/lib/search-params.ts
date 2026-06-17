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

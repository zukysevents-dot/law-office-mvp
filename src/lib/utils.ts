export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** True only for http(s) URLs — use before rendering a stored value as an <a href> to block javascript: etc. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

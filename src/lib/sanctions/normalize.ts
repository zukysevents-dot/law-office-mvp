// Pure name normalization for sanctions matching. Strips diacritics (so
// "Žluťoučký" matches "Zlutoucky"), lowercases, drops punctuation and collapses
// whitespace. No I/O — fully unit-testable.

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

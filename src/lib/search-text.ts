// Fulltextové hledání ve výběrových seznamech (subjekty, projekty, případy,
// úkoly…). Nativní <select> umí jen „psaní od začátku“ — zadání příjmení, které
// je v názvu druhým slovem, nic nenašlo. Tady se hledá kdekoli v textu, bez
// ohledu na velikost písmen a diakritiku, a každé zadané slovo musí v textu
// být (v libovolném pořadí): „firma“ najde „Dobrá firma s.r.o.“, „novak jan“
// najde „Jan Novák“.

/** Malá písmena bez diakritiky a se sjednocenými mezerami. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("cs")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slova dotazu (normalizovaná); prázdný dotaz → []. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

/** Obsahuje text všechna slova dotazu (kdekoli, bez diakritiky)? */
export function matchesSearch(text: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = normalizeSearchText(text);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Vyfiltruje položky podle dotazu; pořadí zůstává (seznamy chodí seřazené).
 * `textOf` vrací vše, v čem se má hledat (název, IČO, spisová značka…).
 */
export function filterBySearch<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [...items];
  }
  return items.filter((item) => {
    const haystack = normalizeSearchText(textOf(item));
    return tokens.every((token) => haystack.includes(token));
  });
}

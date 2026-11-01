// Čistá logika vyhledávacího výběru (SearchableSelect): co se v otevřeném
// seznamu ukáže pro daný dotaz. Bez Reactu, aby šla otestovat.

import { filterBySearch } from "@/lib/search-text";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Doplňující text pod názvem (např. projekt případu); hledá se i v něm. */
  description?: string;
  /** Další text, ve kterém se hledá, ale nezobrazuje se (IČO, spis. zn.…). */
  keywords?: string;
  /** Skupina v seznamu (např. „Moje úkoly“ / „Ostatní úkoly“). */
  group?: string;
};

export type SearchableSelectItem =
  | { kind: "option"; option: SearchableSelectOption }
  | { kind: "empty"; label: string };

export const SEARCHABLE_SELECT_LIMIT = 100;

export function optionSearchText(option: SearchableSelectOption) {
  return [option.label, option.description, option.keywords]
    .filter(Boolean)
    .join(" ");
}

/**
 * Položky seznamu pro dotaz: prázdná volba (jen bez dotazu a pokud je
 * povolená), pak shody v původním pořadí — nejvýše `limit`, `hidden` udává,
 * kolik shod se nevešlo (uživatel má hledání upřesnit).
 */
export function searchableSelectItems(
  options: readonly SearchableSelectOption[],
  query: string,
  {
    emptyLabel,
    limit = SEARCHABLE_SELECT_LIMIT,
  }: { emptyLabel?: string | null; limit?: number } = {},
): { items: SearchableSelectItem[]; hidden: number } {
  const matches = filterBySearch(options, query, optionSearchText);
  const shown = matches.slice(0, limit);
  const items: SearchableSelectItem[] = [];
  if (emptyLabel && !query.trim()) {
    items.push({ kind: "empty", label: emptyLabel });
  }
  for (const option of shown) {
    items.push({ kind: "option", option });
  }
  return { items, hidden: matches.length - shown.length };
}

/** Hodnota položky seznamu (prázdná volba → ""). */
export function itemValue(item: SearchableSelectItem) {
  return item.kind === "option" ? item.option.value : "";
}

/** Index položky, která se má zvýraznit po otevření (vybraná, jinak první). */
export function initialActiveIndex(
  items: readonly SearchableSelectItem[],
  selectedValue: string,
  query: string,
) {
  if (items.length === 0) {
    return -1;
  }
  if (!query.trim()) {
    const index = items.findIndex((item) => itemValue(item) === selectedValue);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

/** Subjekt ve výběru: „Název, IČO 12345678“ (stejný text jako dřív v <option>). */
export function subjectSelectOption(subject: {
  id: string;
  name: string;
  ico?: string | null;
}): SearchableSelectOption {
  return {
    value: subject.id,
    label: subject.ico ? `${subject.name}, IČO ${subject.ico}` : subject.name,
  };
}

/** Obecná položka { id, name } → volba výběru. */
export function namedSelectOption(item: {
  id: string;
  name: string;
}): SearchableSelectOption {
  return { value: item.id, label: item.name };
}

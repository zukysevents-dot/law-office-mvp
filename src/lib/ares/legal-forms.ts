/**
 * Map of common Czech `pravniForma` codes (ARES) → Czech labels.
 *
 * ARES returns only the numeric code in the basic record; this is the stable
 * ČSÚ code list of the forms a law office actually encounters. Unknown codes
 * fall back to a generic label so nothing is ever silently dropped.
 */

const LEGAL_FORM_LABELS: Record<string, string> = {
  "101": "Fyzická osoba podnikající dle živnostenského zákona",
  "102":
    "Fyzická osoba podnikající dle živnostenského zákona zapsaná v obchodním rejstříku",
  "105":
    "Fyzická osoba podnikající dle jiných zákonů než živnostenského a zákona o zemědělství",
  "107": "Zemědělský podnikatel – fyzická osoba",
  "111": "Veřejná obchodní společnost",
  "112": "Společnost s ručením omezeným",
  "113": "Komanditní společnost",
  "121": "Akciová společnost",
  "141": "Obecně prospěšná společnost",
  "161": "Ústav",
  "205": "Družstvo",
  "301": "Státní podnik",
  "325": "Organizační složka státu",
  "331": "Příspěvková organizace",
  "381": "Školská právnická osoba",
  "421": "Odštěpný závod zahraniční právnické osoby",
  "601": "Vysoká škola",
  "706": "Spolek",
  "736": "Pobočný spolek",
  "751": "Zájmové sdružení právnických osob",
  "801": "Obec",
  "804": "Kraj",
  "921": "Mezinárodní organizace a sdružení",
};

/** Czech label for a `pravniForma` code, falling back to the raw code. */
export function legalFormLabel(code: string): string {
  return LEGAL_FORM_LABELS[code] ?? `Právní forma (kód ${code})`;
}

/**
 * Name helpers for natural persons (PERSON) and sole traders (ENTREPRENEUR).
 * `Subject.name` stays filled for every type (search, sorting, invoices,
 * exports): for persons it is composed from the name parts here.
 */

export type PersonNameParts = {
  titleBefore?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  titleAfter?: string | null;
};

export type SubjectNameInput = PersonNameParts & {
  name?: string | null;
  tradeName?: string | null;
};

const clean = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** "JUDr." + "Jan" + "Novák" + "Ph.D." → "JUDr. Jan Novák, Ph.D." */
export function composePersonName(parts: PersonNameParts): string {
  const core = [parts.titleBefore, parts.firstName, parts.lastName]
    .map(clean)
    .filter(Boolean)
    .join(" ");
  const after = clean(parts.titleAfter);
  if (!core) {
    return after;
  }
  return after ? `${core}, ${after}` : core;
}

/**
 * Display name stored in `Subject.name`:
 * - PERSON: composed person name;
 * - ENTREPRENEUR: the trade name (obchodní firma) when it differs from the
 *   composed name, otherwise the composed name;
 * - COMPANY / OTHER: the entered name.
 */
export function composeSubjectName(
  type: string,
  input: SubjectNameInput,
): string {
  if (type === "PERSON") {
    return composePersonName(input);
  }
  if (type === "ENTREPRENEUR") {
    const composed = composePersonName(input);
    const trade = clean(input.tradeName);
    return trade && trade !== composed ? trade : composed;
  }
  return clean(input.name);
}

// Tokens that are academic / professional titles, not name parts.
const TITLE_BEFORE =
  /^(bc|bca|ing|ing\. arch|mgr|mga|mudr|mddr|mvdr|judr|phdr|rndr|paeddr|pharmdr|thdr|thlic|rsdr|dr|doc|prof|akad|arch|dipl)\.?$/i;
const TITLE_AFTER =
  /^(ph\.?d\.?|csc\.?|drsc\.?|dr\.?|th\.?d\.?|dis\.?|mba|mpa|ll\.?m\.?|msc\.?|ba|bsc\.?|dba|dsc\.?)$/i;

/**
 * Best-effort split of a legacy free-text name ("JUDr. Jan Novák, Ph.D.")
 * into parts. Only used to PRE-FILL the edit form of an older subject — the
 * user confirms the result, nothing is written without that.
 */
export function splitPersonName(fullName: string | null | undefined): {
  titleBefore: string;
  firstName: string;
  lastName: string;
  titleAfter: string;
} {
  const text = clean(fullName);
  let main = text;
  const afterParts: string[] = [];

  const comma = text.indexOf(",");
  if (comma >= 0) {
    main = text.slice(0, comma).trim();
    afterParts.push(
      ...text
        .slice(comma + 1)
        .split(/[,\s]+/)
        .filter(Boolean),
    );
  }

  const tokens = main.split(" ").filter(Boolean);
  const before: string[] = [];
  while (tokens.length > 1 && TITLE_BEFORE.test(tokens[0])) {
    before.push(tokens.shift() as string);
  }
  while (tokens.length > 1 && TITLE_AFTER.test(tokens[tokens.length - 1])) {
    afterParts.unshift(tokens.pop() as string);
  }

  const lastName = tokens.length > 0 ? (tokens.pop() as string) : "";
  return {
    titleBefore: before.join(" "),
    firstName: tokens.join(" "),
    lastName,
    titleAfter: afterParts.join(" "),
  };
}

/**
 * The person part of a sole trader's trade name, for splitting it into name
 * parts: "Petr Dvořák – Truhlářství" → "Petr Dvořák". Titles after a comma
 * ("Ing. Petr Dvořák, Ph.D.") are kept.
 */
export function personPartOfTradeName(tradeName: string): string {
  return clean(tradeName.split(/\s+[–—-]\s+/)[0] ?? tradeName);
}

/** "ALEŠ" → "Aleš", "NOVÁK-DVOŘÁK" → "Novák-Dvořák"; mixed case is kept. */
export function capitalizeName(value: string | null | undefined): string {
  const text = clean(value);
  if (!text || text !== text.toLocaleUpperCase("cs-CZ")) {
    return text;
  }
  return text
    .toLocaleLowerCase("cs-CZ")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letter: string) =>
      `${sep}${letter.toLocaleUpperCase("cs-CZ")}`,
    );
}

/**
 * Name used for sanctions screening: the person's name without titles (titles
 * only add noise to fuzzy matching); other subjects use `name` as is.
 */
export function screeningName(subject: {
  type: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (
    (subject.type === "PERSON" || subject.type === "ENTREPRENEUR") &&
    clean(subject.firstName) &&
    clean(subject.lastName)
  ) {
    return `${clean(subject.firstName)} ${clean(subject.lastName)}`;
  }
  return subject.name;
}

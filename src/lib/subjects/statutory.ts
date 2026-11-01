/**
 * Statutory bodies of a subject (SubjectStatutoryBody): jednatel, členové
 * představenstva… Not to be confused with contact persons (ContactPerson) —
 * a statutory body acts on behalf of the subject. A summary of the CURRENT
 * bodies is mirrored into the legacy `Subject.statutoryBody` column.
 */

export const MAX_SUBJECT_STATUTORY_BODIES = 50;
const MAX_TEXT = 500;

export type StatutoryRow = {
  id: string | null;
  name: string;
  function: string | null;
  actingMethod: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  linkedSubjectId: string | null;
  position: number;
};

export type StatutoryLike = {
  name: string;
  function?: string | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
};

export const STATUTORY_FIELDS = [
  "id",
  "name",
  "function",
  "actingMethod",
  "validFrom",
  "validTo",
  "linkedSubjectId",
] as const;

type StatutoryField = (typeof STATUTORY_FIELDS)[number];

function parseDay(value: string): Date | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

const text = (value: string) => (value ? value.slice(0, MAX_TEXT) : null);

export type StatutoryParseResult =
  | { ok: true; rows: StatutoryRow[] }
  | { ok: false };

/**
 * Validates the form rows. A completely empty row is ignored; a row with any
 * value needs a name, valid dates and "Do" not before "Od".
 */
export function parseStatutoryRows(
  rows: Array<{ values: Record<StatutoryField, string> }>,
): StatutoryParseResult {
  const out: StatutoryRow[] = [];
  for (const { values } of rows) {
    const filled =
      values.name ||
      values.function ||
      values.actingMethod ||
      values.validFrom ||
      values.validTo ||
      values.linkedSubjectId;
    if (!filled) {
      continue;
    }
    if (!values.name) {
      return { ok: false };
    }
    const validFrom = parseDay(values.validFrom);
    const validTo = parseDay(values.validTo);
    if (validFrom === undefined || validTo === undefined) {
      return { ok: false };
    }
    if (validFrom && validTo && validTo < validFrom) {
      return { ok: false };
    }
    out.push({
      id: values.id || null,
      name: values.name.slice(0, MAX_TEXT),
      function: text(values.function),
      actingMethod: values.actingMethod ? values.actingMethod.slice(0, 4000) : null,
      validFrom,
      validTo,
      linkedSubjectId: values.linkedSubjectId || null,
      position: out.length,
    });
    if (out.length > MAX_SUBJECT_STATUTORY_BODIES) {
      return { ok: false };
    }
  }
  return { ok: true, rows: out };
}

/** Current = not ended before today (UTC day) and not starting in the future. */
export function isCurrentStatutory(
  row: Pick<StatutoryLike, "validFrom" | "validTo">,
  now: Date = new Date(),
): boolean {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = row.validFrom ? new Date(row.validFrom) : null;
  const to = row.validTo ? new Date(row.validTo) : null;
  return (!to || to >= today) && (!from || from <= now);
}

/** "current" | "former" (ended) | "future" (starts after today) — for badges. */
export function statutoryStatus(
  row: Pick<StatutoryLike, "validFrom" | "validTo">,
  now: Date = new Date(),
): "current" | "former" | "future" {
  if (isCurrentStatutory(row, now)) return "current";
  const from = row.validFrom ? new Date(row.validFrom) : null;
  return from && from > now ? "future" : "former";
}

function summaryItem(row: StatutoryLike) {
  return row.function ? `${row.name} (${row.function})` : row.name;
}

/** Text mirrored into `Subject.statutoryBody` (current bodies only), or null. */
export function statutorySummary(
  rows: StatutoryLike[],
  now: Date = new Date(),
): string | null {
  const items = rows
    .filter((row) => isCurrentStatutory(row, now))
    .map(summaryItem);
  return items.length > 0 ? items.join("; ") : null;
}

/**
 * Tolerates drift from code that only knows `Subject.statutoryBody` (e.g. the
 * old form's free-text field during a deploy): a legacy text that is not
 * covered by the rows is shown / pre-filled as an extra row. Rows are never
 * removed. "Covered" = the whole text equals a row's name, its
 * "name (function)" summary or the summary of all rows (dates ignored — rows
 * that merely expired since the last save must not produce duplicates); or,
 * failing that, every ";"-separated part equals a row's name or summary.
 * The whole-text check matters for migrated subjects: the backfill copied a
 * legacy text such as "Jan Novák, jednatel; Petr Malý, jednatel" into ONE row.
 */
export function mergeLegacyStatutory<T extends StatutoryLike>(
  rows: T[],
  legacy: string | null | undefined,
): Array<T | (StatutoryLike & { id: null })> {
  const text = legacy?.trim();
  if (!text) {
    return rows;
  }
  const known = new Set<string>();
  for (const row of rows) {
    known.add(row.name.trim());
    known.add(summaryItem(row).trim());
  }
  if (rows.length > 0) {
    known.add(rows.map((row) => summaryItem(row).trim()).join("; "));
  }
  if (known.has(text)) {
    return rows;
  }
  const covered = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => known.has(part));
  if (covered) {
    return rows;
  }
  return [...rows, { id: null, name: text, function: null, validFrom: null, validTo: null }];
}

// EU consolidated sanctions list source adapter. The list downloads as one
// ';'-delimited CSV (one row per name alias; rows sharing an entity id are the
// same person/entity). Follows the ARES pattern: hard timeout, no-store,
// discriminated union instead of throwing.
//
// NOTE: the exact EU CSV column names vary slightly across list versions, so the
// header is mapped by fuzzy substring lookup rather than fixed indexes. Validate
// against a real download (EU_SANCTIONS_LIST_URL) before relying on it in prod.

import { euSanctionsListUrl, SANCTIONS_SOURCE } from "@/lib/sanctions/config";
import { normalizeName } from "@/lib/sanctions/normalize";

const FETCH_TIMEOUT_MS = 30_000;

export type ParsedSanctionsEntry = {
  source: string;
  sourceEntityId: string;
  entityType: string;
  primaryName: string;
  normalizedName: string;
  aliasesNormalized: string[];
  countries: string[];
  programs: string[];
};

export type SanctionsFetchResult =
  | { status: "ok"; entries: ParsedSanctionsEntry[] }
  | { status: "error"; message: string };

// Parse one ';'-delimited line honoring "double-quoted" fields (which may
// contain ';' or doubled "" escapes).
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function findColumn(header: string[], ...needles: string[]): number {
  const lower = header.map((cell) => cell.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const needle of needles) {
    const index = lower.findIndex((cell) => cell.includes(needle));
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function cell(row: string[], index: number): string {
  return index >= 0 && index < row.length ? row[index] : "";
}

export function parseEuSanctionsCsv(csv: string): ParsedSanctionsEntry[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return [];
  }
  const header = parseCsvLine(lines[0]);
  const idCol = findColumn(header, "logicalid", "referencenumber", "entityid");
  const typeCol = findColumn(header, "subjecttype", "entitytype", "type");
  const wholeCol = findColumn(header, "wholename", "name");
  const firstCol = findColumn(header, "firstname", "givenname");
  const lastCol = findColumn(header, "lastname", "familyname");
  const countryCol = findColumn(header, "country", "citizenship");
  const programCol = findColumn(header, "programme", "program", "regulation");

  // No recognizable entity-id column means the format changed — refuse rather
  // than silently grouping unrelated same-named people under their name.
  if (idCol === -1) {
    return [];
  }

  const byEntity = new Map<string, ParsedSanctionsEntry>();

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const whole = cell(row, wholeCol);
    const composed = `${cell(row, firstCol)} ${cell(row, lastCol)}`.trim();
    const name = (whole || composed).trim();
    if (!name) {
      continue;
    }
    const groupKey = cell(row, idCol) || name;
    const type = cell(row, typeCol).toLowerCase();
    const entityType = type.includes("person") ? "PERSON" : "ENTITY";
    const country = cell(row, countryCol);
    const program = cell(row, programCol);

    const existing = byEntity.get(groupKey);
    if (existing) {
      const normalized = normalizeName(name);
      if (
        normalized &&
        normalized !== existing.normalizedName &&
        !existing.aliasesNormalized.includes(normalized)
      ) {
        existing.aliasesNormalized.push(normalized);
      }
      if (country && !existing.countries.includes(country)) {
        existing.countries.push(country);
      }
      if (program && !existing.programs.includes(program)) {
        existing.programs.push(program);
      }
    } else {
      byEntity.set(groupKey, {
        source: SANCTIONS_SOURCE,
        sourceEntityId: groupKey,
        entityType,
        primaryName: name,
        normalizedName: normalizeName(name),
        aliasesNormalized: [],
        countries: country ? [country] : [],
        programs: program ? [program] : [],
      });
    }
  }

  return [...byEntity.values()].filter((entry) => entry.normalizedName !== "");
}

export async function fetchEuSanctionsList(): Promise<SanctionsFetchResult> {
  const url = euSanctionsListUrl();
  if (!url) {
    return {
      status: "error",
      message:
        "Není nastavena adresa EU sankčního seznamu (EU_SANCTIONS_LIST_URL).",
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "Stažení sankčního seznamu vypršelo. Zkuste to prosím znovu."
        : "Stažení sankčního seznamu se nezdařilo.",
    };
  }

  if (!res.ok) {
    return {
      status: "error",
      message: `Zdroj sankčního seznamu vrátil chybu (${res.status}).`,
    };
  }

  const csv = await res.text();
  const entries = parseEuSanctionsCsv(csv);
  if (entries.length === 0) {
    return {
      status: "error",
      message: "Sankční seznam je prázdný nebo má neočekávaný formát.",
    };
  }
  return { status: "ok", entries };
}

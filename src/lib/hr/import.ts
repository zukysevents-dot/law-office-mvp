// Vendor-neutral attendance CSV parser (F7 / HR-4).
//
// Supported semicolon-separated schemas (decimal comma and quoted values work):
//   personalNumber;date;workedHours[;breakHours]
//   personalNumber;date;checkIn;checkOut[;breakHours]
//
// A header is optional. With a header, Czech and English column aliases are
// accepted in any order. This covers daily exports from common attendance
// terminals without coupling LawOffice to one hardware vendor. The parser is
// strict: malformed/duplicate rows throw and the caller imports the batch in a
// single transaction.

import { computeWorkedHours } from "@/lib/hr/attendance-calc";

export type ParsedAttendanceRow = {
  personalNumber: string;
  workDate: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  workedHours: number;
  breakHours: number;
};

type AttendanceColumn =
  | "personalNumber"
  | "workDate"
  | "workedHours"
  | "breakHours"
  | "checkIn"
  | "checkOut";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const COLUMN_ALIASES: Record<string, AttendanceColumn> = {
  personalnumber: "personalNumber",
  employeenumber: "personalNumber",
  employeeno: "personalNumber",
  cardnumber: "personalNumber",
  osobni: "personalNumber",
  osobnicislo: "personalNumber",
  cislozamestnance: "personalNumber",
  workdate: "workDate",
  date: "workDate",
  datum: "workDate",
  workedhours: "workedHours",
  hours: "workedHours",
  hodiny: "workedHours",
  odpracovano: "workedHours",
  breakhours: "breakHours",
  break: "breakHours",
  prestavka: "breakHours",
  pauza: "breakHours",
  checkin: "checkIn",
  arrival: "checkIn",
  prichod: "checkIn",
  zacatek: "checkIn",
  checkout: "checkOut",
  departure: "checkOut",
  odchod: "checkOut",
  konec: "checkOut",
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(raw: string, line: number): string[] {
  const columns: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') {
      if (quoted && raw[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ";" && !quoted) {
      columns.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  if (quoted) {
    throw new Error(`Řádek ${line}: neukončená uvozovka v CSV.`);
  }
  columns.push(value.trim());
  return columns;
}

function parseNumber(value: string, line: number, field: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Řádek ${line}: neplatná hodnota „${field}".`);
  }
  return parsed;
}

function parseDate(value: string, line: number): Date {
  if (!DATE_RE.test(value)) {
    throw new Error(`Řádek ${line}: datum musí být ve formátu RRRR-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Řádek ${line}: neplatné datum.`);
  }
  return parsed;
}

function parseWallClock(value: string, date: string, line: number, field: string) {
  const match = TIME_RE.exec(value);
  if (!match) {
    throw new Error(
      `Řádek ${line}: ${field} musí být ve formátu HH:MM nebo HH:MM:SS.`,
    );
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Řádek ${line}: neplatný čas „${field}".`);
  }
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`,
  );
}

function headerMap(columns: string[]): Map<AttendanceColumn, number> | null {
  const mapped = new Map<AttendanceColumn, number>();
  columns.forEach((column, index) => {
    const name = COLUMN_ALIASES[normalizeHeader(column)];
    if (name) mapped.set(name, index);
  });

  if (mapped.size === 0) return null;
  const hasTotals = mapped.has("workedHours");
  const hasPunches = mapped.has("checkIn") && mapped.has("checkOut");
  if (!mapped.has("personalNumber") || !mapped.has("workDate")) return null;
  return hasTotals || hasPunches ? mapped : null;
}

function valueAt(
  columns: string[],
  map: Map<AttendanceColumn, number>,
  column: AttendanceColumn,
): string {
  const index = map.get(column);
  return index == null ? "" : (columns[index] ?? "").trim();
}

export function parseAttendanceCsv(csv: string): ParsedAttendanceRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw.length > 0);
  if (lines.length === 0) return [];

  const firstColumns = splitCsvLine(lines[0].raw, lines[0].line);
  const firstHeader = headerMap(firstColumns);
  const hasHeader = Boolean(firstHeader) && !DATE_RE.test(firstColumns[1] ?? "");
  const columnsByName = hasHeader ? firstHeader : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedAttendanceRow[] = [];
  const employeeDays = new Set<string>();

  for (const { raw, line } of dataLines) {
    const columns = splitCsvLine(raw, line);
    if (columns.length < 3) {
      throw new Error(`Řádek ${line}: očekávány alespoň 3 sloupce.`);
    }

    const personalNumber = columnsByName
      ? valueAt(columns, columnsByName, "personalNumber")
      : columns[0];
    if (!personalNumber) {
      throw new Error(`Řádek ${line}: chybí osobní číslo.`);
    }

    const dateValue = columnsByName
      ? valueAt(columns, columnsByName, "workDate")
      : columns[1];
    const workDate = parseDate(dateValue, line);
    const terminalRow = columnsByName
      ? columnsByName.has("checkIn") && columnsByName.has("checkOut")
      : TIME_RE.test(columns[2] ?? "") || TIME_RE.test(columns[3] ?? "");

    let checkIn: Date | null = null;
    let checkOut: Date | null = null;
    let workedHours: number;
    let breakHours: number;

    if (terminalRow) {
      const checkInValue = columnsByName
        ? valueAt(columns, columnsByName, "checkIn")
        : columns[2];
      const checkOutValue = columnsByName
        ? valueAt(columns, columnsByName, "checkOut")
        : columns[3];
      if (!checkInValue || !checkOutValue) {
        throw new Error(`Řádek ${line}: chybí příchod nebo odchod.`);
      }
      checkIn = parseWallClock(checkInValue, dateValue, line, "příchod");
      checkOut = parseWallClock(checkOutValue, dateValue, line, "odchod");
      if (checkOut.getTime() === checkIn.getTime()) {
        throw new Error(`Řádek ${line}: příchod a odchod nesmí být stejný.`);
      }
      // A lower checkout time is a night shift ending on the following day.
      if (checkOut < checkIn) {
        checkOut = new Date(checkOut.getTime() + 24 * 60 * 60 * 1000);
      }
      const breakValue = columnsByName
        ? valueAt(columns, columnsByName, "breakHours")
        : (columns[4] ?? "");
      breakHours = breakValue ? parseNumber(breakValue, line, "přestávka") : 0;
      const grossHours = (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
      if (breakHours >= grossHours) {
        throw new Error(`Řádek ${line}: přestávka musí být kratší než směna.`);
      }
      workedHours = computeWorkedHours(checkIn, checkOut, breakHours);
    } else {
      const hoursValue = columnsByName
        ? valueAt(columns, columnsByName, "workedHours")
        : columns[2];
      workedHours = parseNumber(hoursValue, line, "odpracováno");
      const breakValue = columnsByName
        ? valueAt(columns, columnsByName, "breakHours")
        : (columns[3] ?? "");
      breakHours = breakValue ? parseNumber(breakValue, line, "přestávka") : 0;
    }

    if (workedHours > 24 || breakHours > 24) {
      throw new Error(`Řádek ${line}: hodiny mimo rozsah.`);
    }

    const employeeDay = `${personalNumber}\u0000${dateValue}`;
    if (employeeDays.has(employeeDay)) {
      throw new Error(
        `Řádek ${line}: zaměstnanec ${personalNumber} má datum ${dateValue} v souboru vícekrát.`,
      );
    }
    employeeDays.add(employeeDay);
    rows.push({
      personalNumber,
      workDate,
      checkIn,
      checkOut,
      workedHours,
      breakHours,
    });
  }

  return rows;
}

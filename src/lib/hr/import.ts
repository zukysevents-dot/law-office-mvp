// Pure attendance CSV parser (F7 / HR-4). Software-only import — no hardware.
// Format (semicolon separated; decimal comma allowed), one row per employee-day:
//   personalNumber;YYYY-MM-DD;workedHours[;breakHours]
// An optional header line (containing non-numeric tokens) is skipped. The parser
// is strict: a malformed row throws with its line number and NOTHING is imported
// (the caller wraps the whole batch in one transaction).

export type ParsedAttendanceRow = {
  personalNumber: string;
  workDate: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  workedHours: number;
  breakHours: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseNumber(value: string, line: number, field: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Řádek ${line}: neplatná hodnota „${field}".`);
  }
  return parsed;
}

export function parseAttendanceCsv(csv: string): ParsedAttendanceRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: ParsedAttendanceRow[] = [];

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    // Semicolon-separated (Czech CSV standard) so the decimal comma in "7,5"
    // survives as a value, not a column break.
    const cols = raw.split(";").map((c) => c.trim());

    // Skip an optional header row: on line 1, a non-numeric personal number AND a
    // non-date 2nd column = a label header (e.g. "osobni;datum;..."). A real data
    // row has either a numeric personal number or a valid date in column 2, so a
    // malformed first data row still falls through and errors below.
    if (
      index === 0 &&
      Number.isNaN(Number(cols[0])) &&
      !DATE_RE.test(cols[1] ?? "")
    ) {
      return;
    }

    if (cols.length < 3) {
      throw new Error(`Řádek ${lineNo}: očekávány alespoň 3 sloupce.`);
    }

    const personalNumber = cols[0];
    if (!personalNumber) {
      throw new Error(`Řádek ${lineNo}: chybí osobní číslo.`);
    }

    const dateStr = cols[1];
    if (!DATE_RE.test(dateStr)) {
      throw new Error(`Řádek ${lineNo}: datum musí být ve formátu RRRR-MM-DD.`);
    }
    const workDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(workDate.getTime())) {
      throw new Error(`Řádek ${lineNo}: neplatné datum.`);
    }

    const workedHours = parseNumber(cols[2], lineNo, "odpracováno");
    if (workedHours > 24) {
      throw new Error(`Řádek ${lineNo}: odpracované hodiny mimo rozsah.`);
    }
    const breakHours = cols[3] ? parseNumber(cols[3], lineNo, "přestávka") : 0;

    rows.push({
      personalNumber,
      workDate,
      checkIn: null,
      checkOut: null,
      workedHours,
      breakHours,
    });
  });

  return rows;
}

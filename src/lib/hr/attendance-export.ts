import { round2 } from "@/lib/hr/leave-balance";
import { formatAttendanceTime } from "@/lib/hr/attendance-calc";

// Pure řádky exportu docházky (CSV/XLSX). Časy jsou pražské (formatAttendance-
// Time), datum je kalendářní den záznamu — nezávisle na časové zóně serveru.

export type AttendanceExportInput = {
  workDate: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  breakHours: number;
  workedHours: number;
  sourceLabel: string;
  note: string | null;
  employee: { firstName: string; lastName: string; personalNumber: string | null };
};

export type AttendanceExportRow = {
  date: string;
  weekday: string;
  personalNumber: string;
  name: string;
  checkIn: string;
  checkOut: string;
  breakHours: number;
  workedHours: number;
  source: string;
  note: string;
};

export const ATTENDANCE_EXPORT_HEADERS = [
  "Datum",
  "Den",
  "Osobní číslo",
  "Zaměstnanec",
  "Příchod",
  "Odchod",
  "Přestávka (h)",
  "Odpracováno (h)",
  "Zdroj",
  "Poznámka",
] as const;

const WEEKDAYS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function czechDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

export function buildAttendanceExportRows(
  records: AttendanceExportInput[],
): AttendanceExportRow[] {
  return records.map((record) => ({
    date: czechDate(record.workDate),
    weekday: WEEKDAYS[record.workDate.getUTCDay()],
    personalNumber: record.employee.personalNumber ?? "",
    name: `${record.employee.lastName} ${record.employee.firstName}`,
    checkIn: record.checkIn
      ? formatAttendanceTime(record.checkIn, record.workDate)
      : "",
    checkOut: record.checkOut
      ? formatAttendanceTime(record.checkOut, record.workDate)
      : "",
    breakHours: round2(record.breakHours),
    workedHours: round2(record.workedHours),
    source: record.sourceLabel,
    note: record.note ?? "",
  }));
}

export function sumWorkedHours(rows: Pick<AttendanceExportRow, "workedHours">[]): number {
  return round2(rows.reduce((total, row) => total + row.workedHours, 0));
}

// Název souboru jen z ASCII (Content-Disposition), např.
// dochazka_2026-10-01_2026-10-31.csv.
export function attendanceExportFilename(
  filters: { from: string; to: string },
  extension: "csv" | "xlsx",
): string {
  const parts = ["dochazka", filters.from || "od-zacatku", filters.to || "dosud"];
  return `${parts.join("_")}.${extension}`;
}

// Pure payroll CSV builder (F7 / HR-7). A generic, neutral CSV summary per
// employee for a period — the native Pámica/Pamica XML format is a documented
// future extension (it depends on the customer's payroll software version).
// Semicolon-separated with decimal comma (Czech convention).

export type PayrollRow = {
  personalNumber: string | null;
  name: string;
  workedHours: number;
  vacationHours: number;
  sickHours: number;
  otherAbsenceHours: number;
};

const HEADER = [
  "Osobni cislo",
  "Jmeno",
  "Odpracovano",
  "Dovolena",
  "Nemoc",
  "Jine absence",
];

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString().replace(".", ",");
}

// Escape a field for semicolon CSV: quote if it contains ; " or a newline.
function field(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPayrollCsv(rows: PayrollRow[]): string {
  const lines = [HEADER.join(";")];
  for (const row of rows) {
    lines.push(
      [
        field(row.personalNumber ?? ""),
        field(row.name),
        num(row.workedHours),
        num(row.vacationHours),
        num(row.sickHours),
        num(row.otherAbsenceHours),
      ].join(";"),
    );
  }
  // Trailing newline so the file ends cleanly.
  return lines.join("\r\n") + "\r\n";
}

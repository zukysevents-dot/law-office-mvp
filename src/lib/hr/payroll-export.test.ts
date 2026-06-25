import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPayrollCsv, type PayrollRow } from "./payroll-export";

test("buildPayrollCsv: header + rows, decimal comma, CRLF", () => {
  const rows: PayrollRow[] = [
    {
      personalNumber: "1001",
      name: "Novák Jan",
      workedHours: 160,
      vacationHours: 8,
      sickHours: 0,
      otherAbsenceHours: 4.5,
    },
  ];
  const csv = buildPayrollCsv(rows);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Osobni cislo;Jmeno;Odpracovano;Dovolena;Nemoc;Jine absence");
  assert.equal(lines[1], "1001;Novák Jan;160;8;0;4,5");
  assert.equal(csv.endsWith("\r\n"), true);
});

test("buildPayrollCsv: empty rows → header only", () => {
  const csv = buildPayrollCsv([]);
  assert.equal(csv, "Osobni cislo;Jmeno;Odpracovano;Dovolena;Nemoc;Jine absence\r\n");
});

test("buildPayrollCsv: quotes a field containing a semicolon", () => {
  const csv = buildPayrollCsv([
    {
      personalNumber: null,
      name: "Firma; s.r.o.",
      workedHours: 0,
      vacationHours: 0,
      sickHours: 0,
      otherAbsenceHours: 0,
    },
  ]);
  assert.match(csv, /;"Firma; s\.r\.o\.";/);
});

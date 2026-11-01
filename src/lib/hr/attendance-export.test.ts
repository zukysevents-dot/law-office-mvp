import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attendanceExportFilename,
  buildAttendanceExportRows,
  sumWorkedHours,
} from "./attendance-export";

const employee = { firstName: "Jana", lastName: "Nováková", personalNumber: "1001" };

test("buildAttendanceExportRows: pražské časy, české datum a den v týdnu", () => {
  const rows = buildAttendanceExportRows([
    {
      // 19. 10. 2026 (pondělí, CEST): 9:00–17:00
      workDate: new Date("2026-10-19T00:00:00.000Z"),
      checkIn: new Date("2026-10-19T07:00:00.000Z"),
      checkOut: new Date("2026-10-19T15:00:00.000Z"),
      breakHours: 0.5,
      workedHours: 7.5,
      sourceLabel: "Ruční",
      note: null,
      employee,
    },
    {
      // 26. 10. 2026 (pondělí, CET), jen denní součet
      workDate: new Date("2026-10-26T00:00:00.000Z"),
      checkIn: null,
      checkOut: null,
      breakHours: 0,
      workedHours: 8,
      sourceLabel: "Import",
      note: "terminál",
      employee: { ...employee, personalNumber: null },
    },
  ]);
  assert.deepEqual(rows[0], {
    date: "19.10.2026",
    weekday: "Po",
    personalNumber: "1001",
    name: "Nováková Jana",
    checkIn: "09:00",
    checkOut: "17:00",
    breakHours: 0.5,
    workedHours: 7.5,
    source: "Ruční",
    note: "",
  });
  assert.equal(rows[1].checkIn, "");
  assert.equal(rows[1].personalNumber, "");
  assert.equal(rows[1].note, "terminál");
  assert.equal(sumWorkedHours(rows), 15.5);
});

test("attendanceExportFilename: ASCII název podle období", () => {
  assert.equal(
    attendanceExportFilename({ from: "2026-10-01", to: "2026-10-31" }, "csv"),
    "dochazka_2026-10-01_2026-10-31.csv",
  );
  assert.equal(
    attendanceExportFilename({ from: "", to: "" }, "xlsx"),
    "dochazka_od-zacatku_dosud.xlsx",
  );
});

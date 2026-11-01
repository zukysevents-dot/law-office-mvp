import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HrAbsenceStatus,
  HrAbsenceType,
  HrPresenceStatus,
} from "@/generated/prisma/enums";
import { hrAbsenceTypeLabels } from "@/lib/labels";

import {
  PRESENCE_NOTE_MAX,
  buildPresenceRows,
  parsePresencePlanEntries,
  parseWeekStart,
  resolvePresenceCell,
  summarizePresenceDay,
  toDateKey,
  weekWorkdays,
  type PresenceAbsenceRow,
} from "./presence";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const now = new Date("2026-11-04T10:00:00.000Z"); // středa

// --- parseWeekStart / weekWorkdays -----------------------------------------------

test("parseWeekStart: libovolný den → pondělí jeho týdne", () => {
  assert.equal(toDateKey(new Date(parseWeekStart("2026-11-04", now))), "2026-11-02");
  assert.equal(toDateKey(new Date(parseWeekStart("2026-11-08", now))), "2026-11-02"); // neděle
  assert.equal(toDateKey(new Date(parseWeekStart("2026-11-02", now))), "2026-11-02");
});

test("parseWeekStart: neplatná hodnota → aktuální kancelářský týden", () => {
  for (const value of [null, undefined, "", "2026-13-01", "2026-02-30", "x"]) {
    assert.equal(toDateKey(new Date(parseWeekStart(value, now))), "2026-11-02");
  }
});

test("parseWeekStart: neděle 23:30 UTC je v Praze už pondělí", () => {
  const mondayPrague = new Date("2026-11-08T23:30:00.000Z");
  assert.equal(toDateKey(new Date(parseWeekStart(null, mondayPrague))), "2026-11-09");
});

test("weekWorkdays: Po–Pá od pondělí", () => {
  assert.deepEqual(
    weekWorkdays(parseWeekStart("2026-11-02", now)).map(toDateKey),
    ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
  );
});

// --- resolvePresenceCell ------------------------------------------------------

const absence = (overrides: Partial<PresenceAbsenceRow> = {}): PresenceAbsenceRow => ({
  employeeId: "e1",
  type: HrAbsenceType.VACATION,
  status: HrAbsenceStatus.APPROVED,
  startDate: d("2026-11-03"),
  endDate: d("2026-11-04"),
  halfDay: false,
  ...overrides,
});

const plan = {
  employeeId: "e1",
  date: d("2026-11-03"),
  status: HrPresenceStatus.OFFICE,
  note: "odpoledne porada",
};

test("resolvePresenceCell: bez plánu i absence → nevyplněno", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-02"),
    plan: null,
    absences: [],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.kind, "NONE");
  assert.equal(cell.source, "none");
  assert.equal(cell.date, "2026-11-02");
});

test("resolvePresenceCell: plán dne", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-03"),
    plan,
    absences: [],
    revealAbsenceType: false,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.kind, "OFFICE");
  assert.equal(cell.source, "plan");
  assert.equal(cell.label, "V kanceláři");
  assert.equal(cell.note, "odpoledne porada");
});

test("resolvePresenceCell: schválená absence přebije plán (nic se nezadává dvakrát)", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-03"),
    plan,
    absences: [absence()],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.kind, "ABSENCE");
  assert.equal(cell.source, "absence");
  assert.equal(cell.label, "Dovolená");
  assert.equal(cell.pending, false);
});

test("resolvePresenceCell: kolegům se typ absence nezobrazí", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-03"),
    plan: null,
    absences: [absence({ type: HrAbsenceType.SICK })],
    revealAbsenceType: false,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.label, "Nepřítomen");
});

test("resolvePresenceCell: absence typu home office je home office", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-04"),
    plan: null,
    absences: [absence({ type: HrAbsenceType.HOME_OFFICE })],
    revealAbsenceType: false,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.kind, "HOME_OFFICE");
  assert.equal(cell.label, "Home office");
  assert.equal(cell.source, "absence");
});

test("resolvePresenceCell: zamítnutá/zrušená absence se ignoruje, mimo rozsah také", () => {
  for (const status of [HrAbsenceStatus.REJECTED, HrAbsenceStatus.CANCELLED]) {
    const cell = resolvePresenceCell({
      day: d("2026-11-03"),
      plan,
      absences: [absence({ status })],
      revealAbsenceType: true,
      typeLabels: hrAbsenceTypeLabels,
    });
    assert.equal(cell.source, "plan", status);
  }
  const outside = resolvePresenceCell({
    day: d("2026-11-05"),
    plan: null,
    absences: [absence()],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(outside.kind, "NONE");
});

test("resolvePresenceCell: čekající žádost je označená, schválená má přednost", () => {
  const pending = resolvePresenceCell({
    day: d("2026-11-03"),
    plan: null,
    absences: [absence({ status: HrAbsenceStatus.PENDING, halfDay: true })],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(pending.pending, true);
  assert.equal(pending.halfDay, true);

  const both = resolvePresenceCell({
    day: d("2026-11-03"),
    plan: null,
    absences: [
      absence({ status: HrAbsenceStatus.PENDING, type: HrAbsenceType.DOCTOR }),
      absence({ status: HrAbsenceStatus.APPROVED, type: HrAbsenceType.SEMINAR_CAK }),
    ],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(both.pending, false);
  assert.equal(both.label, "Seminář ČAK");
});

test("resolvePresenceCell: absence s časem v datu (ne půlnoc) pokrývá celý den", () => {
  const cell = resolvePresenceCell({
    day: d("2026-11-04"),
    plan: null,
    absences: [absence({ endDate: new Date("2026-11-04T15:00:00.000Z") })],
    revealAbsenceType: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(cell.kind, "ABSENCE");
});

// --- buildPresenceRows / summarizePresenceDay -------------------------------------

test("buildPresenceRows: typ absence vidí jen dotyčný a správce HR", () => {
  const employees = [
    { id: "e1", firstName: "Jan", lastName: "Novák", userId: "u1" },
    { id: "e2", firstName: "Eva", lastName: "Malá", userId: "u2" },
  ];
  const days = [d("2026-11-03")];
  const absences = [
    absence({ employeeId: "e1", type: HrAbsenceType.SICK }),
    absence({ employeeId: "e2", type: HrAbsenceType.DOCTOR }),
  ];

  const asJan = buildPresenceRows({
    employees,
    days,
    plans: [],
    absences,
    viewerUserId: "u1",
    viewerIsHrManager: false,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(asJan[0].cells[0].label, "Nemoc");
  assert.equal(asJan[1].cells[0].label, "Nepřítomen");

  const asManager = buildPresenceRows({
    employees,
    days,
    plans: [],
    absences,
    viewerUserId: "u-boss",
    viewerIsHrManager: true,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.equal(asManager[1].cells[0].label, "Lékař");
});

test("buildPresenceRows + summarizePresenceDay: plány se přiřadí ke dni a člověku", () => {
  const employees = [
    { id: "e1", firstName: "Jan", lastName: "Novák", userId: "u1" },
    { id: "e2", firstName: "Eva", lastName: "Malá", userId: null },
    { id: "e3", firstName: "Petr", lastName: "Dlouhý", userId: "u3" },
  ];
  const days = [d("2026-11-02"), d("2026-11-03")];
  const rows = buildPresenceRows({
    employees,
    days,
    plans: [
      { employeeId: "e1", date: d("2026-11-02"), status: HrPresenceStatus.OFFICE, note: null },
      { employeeId: "e2", date: d("2026-11-02"), status: HrPresenceStatus.HOME_OFFICE, note: null },
      { employeeId: "e1", date: d("2026-11-03"), status: HrPresenceStatus.OUT_OF_OFFICE, note: "soud" },
    ],
    absences: [absence({ employeeId: "e3", startDate: d("2026-11-02"), endDate: d("2026-11-02") })],
    viewerUserId: "u1",
    viewerIsHrManager: false,
    typeLabels: hrAbsenceTypeLabels,
  });
  assert.deepEqual(
    rows.map((row) => row.cells.map((cell) => cell.kind)),
    [
      ["OFFICE", "OUT_OF_OFFICE"],
      ["HOME_OFFICE", "NONE"],
      ["ABSENCE", "NONE"],
    ],
  );
  assert.deepEqual(summarizePresenceDay(rows, 0), {
    OFFICE: 1,
    HOME_OFFICE: 1,
    OUT_OF_OFFICE: 0,
    ABSENCE: 1,
    NONE: 0,
  });
  assert.equal(summarizePresenceDay(rows, 1).NONE, 2);
});

// --- parsePresencePlanEntries -------------------------------------------------------

test("parsePresencePlanEntries: jen dny týdne, neplatný status = smazání, poznámka jen se statusem", () => {
  const form = new FormData();
  form.set("status_2026-11-02", "OFFICE");
  form.set("note_2026-11-02", "  porada v 9:00 ");
  form.set("status_2026-11-03", "VACATION");
  form.set("note_2026-11-03", "pryč");
  form.set("status_2026-11-09", "OFFICE"); // mimo týden
  const entries = parsePresencePlanEntries(
    (key) => form.get(key),
    ["2026-11-02", "2026-11-03", "2026-11-04"],
  );
  assert.deepEqual(entries, [
    { date: "2026-11-02", status: HrPresenceStatus.OFFICE, note: "porada v 9:00" },
    { date: "2026-11-03", status: null, note: null },
    { date: "2026-11-04", status: null, note: null },
  ]);
});

test("parsePresencePlanEntries: příliš dlouhá poznámka → chyba", () => {
  const form = new FormData();
  form.set("status_2026-11-02", "HOME_OFFICE");
  form.set("note_2026-11-02", "x".repeat(PRESENCE_NOTE_MAX + 1));
  assert.throws(() => parsePresencePlanEntries((key) => form.get(key), ["2026-11-02"]));
});

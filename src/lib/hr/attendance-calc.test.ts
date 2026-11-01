import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyPunch,
  computeOvertimeHours,
  computeWorkedHours,
  formatAttendanceTime,
  formatOfficeTime,
  normalizeAttendanceHours,
  officeWallClockToInstant,
  officeWorkDate,
  punchStatus,
  type PunchRecordState,
} from "./attendance-calc";

const t = (iso: string) => new Date(iso);

// --- officeWorkDate (pražská TZ, hranice půlnoci) ---------------------------

test("officeWorkDate: CET (zima) — 23:30 UTC = 00:30 lokálně → další den", () => {
  // 2026-01-15 23:30 UTC, CET (+1) → lokálně 2026-01-16 00:30 → den 16.
  assert.equal(
    officeWorkDate(t("2026-01-15T23:30:00Z")).toISOString(),
    "2026-01-16T00:00:00.000Z",
  );
});

test("officeWorkDate: CEST (léto) — 22:30 UTC = 00:30 lokálně → další den", () => {
  // 2026-06-15 22:30 UTC, CEST (+2) → lokálně 2026-06-16 00:30 → den 16.
  assert.equal(
    officeWorkDate(t("2026-06-15T22:30:00Z")).toISOString(),
    "2026-06-16T00:00:00.000Z",
  );
});

test("officeWorkDate: CEST — 21:30 UTC = 23:30 lokálně → týž den", () => {
  assert.equal(
    officeWorkDate(t("2026-06-15T21:30:00Z")).toISOString(),
    "2026-06-15T00:00:00.000Z",
  );
});

test("officeWorkDate: poledne UTC → týž kalendářní den", () => {
  assert.equal(
    officeWorkDate(t("2026-03-10T12:00:00Z")).toISOString(),
    "2026-03-10T00:00:00.000Z",
  );
});

test("computeWorkedHours: out - in - break, never negative", () => {
  assert.equal(
    computeWorkedHours(t("2026-06-22T08:00:00Z"), t("2026-06-22T16:30:00Z"), 0.5),
    8,
  );
  assert.equal(
    computeWorkedHours(t("2026-06-22T09:00:00Z"), t("2026-06-22T17:00:00Z"), 1),
    7,
  );
  // Break longer than the shift → clamped to 0, not negative.
  assert.equal(
    computeWorkedHours(t("2026-06-22T09:00:00Z"), t("2026-06-22T10:00:00Z"), 2),
    0,
  );
});

test("computeOvertimeHours: hours beyond the daily fund, never negative", () => {
  assert.equal(computeOvertimeHours(9.5, 8), 1.5);
  assert.equal(computeOvertimeHours(7, 8), 0); // under fund → no overtime
  assert.equal(computeOvertimeHours(8, 8), 0);
});

// --- officeWallClockToInstant (pražský čas → okamžik) -----------------------

test("officeWallClockToInstant: letní čas (CEST, UTC+2)", () => {
  assert.equal(
    officeWallClockToInstant(t("2026-10-12T00:00:00Z"), 8, 0).toISOString(),
    "2026-10-12T06:00:00.000Z",
  );
});

test("officeWallClockToInstant: zimní čas (CET, UTC+1)", () => {
  assert.equal(
    officeWallClockToInstant(t("2026-01-15T00:00:00Z"), 16, 30).toISOString(),
    "2026-01-15T15:30:00.000Z",
  );
});

test("officeWallClockToInstant: den přechodu na zimní čas", () => {
  // 25. 10. 2026 se ve 3:00 CEST posouvá na 2:00 CET.
  assert.equal(
    officeWallClockToInstant(t("2026-10-25T00:00:00Z"), 8, 0).toISOString(),
    "2026-10-25T07:00:00.000Z",
  );
  assert.equal(
    officeWallClockToInstant(t("2026-10-25T00:00:00Z"), 1, 0).toISOString(),
    "2026-10-24T23:00:00.000Z",
  );
});

test("officeWallClockToInstant: půlnoc patří k danému dni", () => {
  assert.equal(
    officeWorkDate(officeWallClockToInstant(t("2026-07-01T00:00:00Z"), 0, 15)).toISOString(),
    "2026-07-01T00:00:00.000Z",
  );
});

// --- Zpětná vazba z testování 19.–20. 10. 2026: zadáno 9:00, zobrazilo 11:00 --

test("ruční zápis 9:00–17:00 v CEST se uloží a zobrazí jako 9:00–17:00", () => {
  const day = t("2026-10-19T00:00:00Z");
  const checkIn = officeWallClockToInstant(day, 9, 0);
  const checkOut = officeWallClockToInstant(day, 17, 0);
  assert.equal(checkIn.toISOString(), "2026-10-19T07:00:00.000Z");
  assert.equal(checkOut.toISOString(), "2026-10-19T15:00:00.000Z");
  assert.equal(formatOfficeTime(checkIn), "09:00");
  assert.equal(formatOfficeTime(checkOut), "17:00");
  assert.equal(computeWorkedHours(checkIn, checkOut, 0.5), 7.5);
});

test("ruční zápis 9:00 po přechodu na zimní čas (26. 10. 2026, CET)", () => {
  const day = t("2026-10-26T00:00:00Z");
  const checkIn = officeWallClockToInstant(day, 9, 0);
  assert.equal(checkIn.toISOString(), "2026-10-26T08:00:00.000Z");
  assert.equal(formatOfficeTime(checkIn), "09:00");
});

test("officeWallClockToInstant: 24. a 25. 10. 2026 kolem přechodu", () => {
  // Sobota 24. 10. ještě CEST (+2).
  assert.equal(
    officeWallClockToInstant(t("2026-10-24T00:00:00Z"), 9, 0).toISOString(),
    "2026-10-24T07:00:00.000Z",
  );
  // Neděle 25. 10.: 9:00 už CET (+1); celý den má 25 h.
  const start = officeWallClockToInstant(t("2026-10-25T00:00:00Z"), 0, 0);
  const end = officeWallClockToInstant(t("2026-10-26T00:00:00Z"), 0, 0);
  assert.equal((end.getTime() - start.getTime()) / 3_600_000, 25);
  // Přechod na letní čas 29. 3. 2026 — den má 23 h.
  const springStart = officeWallClockToInstant(t("2026-03-29T00:00:00Z"), 0, 0);
  const springEnd = officeWallClockToInstant(t("2026-03-30T00:00:00Z"), 0, 0);
  assert.equal((springEnd.getTime() - springStart.getTime()) / 3_600_000, 23);
});

test("formatOfficeTime nezávisí na zóně serveru (UTC okamžik → pražský čas)", () => {
  assert.equal(formatOfficeTime(t("2026-07-01T06:05:00Z")), "08:05");
  assert.equal(formatOfficeTime(t("2026-12-01T06:05:00Z")), "07:05");
  assert.equal(formatOfficeTime(t("2026-10-24T22:30:00Z")), "00:30");
});

test("formatAttendanceTime: noční směna končí další den", () => {
  const day = t("2026-07-21T00:00:00Z");
  assert.equal(formatAttendanceTime(t("2026-07-21T06:00:00Z"), day), "08:00");
  assert.equal(formatAttendanceTime(t("2026-07-22T04:30:00Z"), day), "06:30 (+1 d)");
});

// --- applyPunch: opakovaný příchod/odchod během dne ------------------------

const morning = t("2026-11-02T07:00:00Z"); // 8:00 CET
const lunchOut = t("2026-11-02T11:00:00Z"); // 12:00
const lunchBack = t("2026-11-02T11:45:00Z"); // 12:45
const evening = t("2026-11-02T16:00:00Z"); // 17:00

function expectOk(result: ReturnType<typeof applyPunch>): PunchRecordState {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.state;
}

test("applyPunch: příchod → odchod na oběd → příchod → odchod", () => {
  const afterIn = expectOk(applyPunch(null, "in", morning));
  assert.equal(punchStatus(afterIn), "in");
  assert.equal(afterIn.checkIn, morning);

  const afterLunchOut = expectOk(applyPunch(afterIn, "out", lunchOut));
  assert.equal(punchStatus(afterLunchOut), "out");
  assert.equal(afterLunchOut.workedHours, 4);

  // Znovu příchod musí jít (dřív bylo tlačítko po odchodu zablokované).
  const afterBack = expectOk(applyPunch(afterLunchOut, "in", lunchBack));
  assert.equal(punchStatus(afterBack), "in");
  assert.equal(afterBack.checkIn, morning); // první příchod zůstává
  assert.equal(afterBack.checkOut, null);
  assert.equal(afterBack.breakHours, 0.75);
  assert.equal(afterBack.workedHours, 4); // odpracováno zatím

  const afterEvening = expectOk(applyPunch(afterBack, "out", evening));
  assert.equal(afterEvening.checkOut, evening);
  assert.equal(afterEvening.breakHours, 0.75);
  assert.equal(afterEvening.workedHours, 8.25); // 9 h − 0,75 h
});

test("applyPunch: přičte se k ručně zadané přestávce", () => {
  const state = expectOk(
    applyPunch(
      { checkIn: morning, checkOut: lunchOut, breakHours: 0.5, workedHours: 3.5 },
      "in",
      lunchBack,
    ),
  );
  assert.equal(state.breakHours, 1.25);
});

test("applyPunch: nepovolené přechody vrací českou hlášku", () => {
  const open = { checkIn: morning, checkOut: null, breakHours: 0, workedHours: 0 };
  const closed = { checkIn: morning, checkOut: evening, breakHours: 0, workedHours: 9 };
  const inTwice = applyPunch(open, "in", lunchOut);
  assert.equal(inTwice.ok, false);
  assert.match(!inTwice.ok ? inTwice.error : "", /nejdřív zaznamenejte odchod/);
  const outWithoutIn = applyPunch(null, "out", lunchOut);
  assert.match(!outWithoutIn.ok ? outWithoutIn.error : "", /Nejdřív zaznamenejte příchod/);
  const outTwice = applyPunch(closed, "out", t("2026-11-02T17:00:00Z"));
  assert.match(!outTwice.ok ? outTwice.error : "", /po návratu zaznamenejte příchod/);
  // Ručně zapsaný odchod v budoucnu (17:00) — příchod ve 12:45 nejde.
  const backBeforeCheckout = applyPunch(closed, "in", lunchBack);
  assert.match(!backBeforeCheckout.ok ? backBeforeCheckout.error : "", /17:00/);
  const orphanOut = applyPunch(
    { checkIn: null, checkOut: evening, breakHours: 0, workedHours: 0 },
    "in",
    lunchBack,
  );
  assert.equal(orphanOut.ok, false);
});

test("applyPunch: záznam jen s denním součtem (bez časů) — příchod jde", () => {
  const state = expectOk(
    applyPunch({ checkIn: null, checkOut: null, breakHours: 0, workedHours: 8 }, "in", morning),
  );
  assert.equal(state.checkIn, morning);
});

test("normalizeAttendanceHours: přestávka po 0,1 h, rozsah 0–24", () => {
  assert.equal(normalizeAttendanceHours(0.1), 0.1);
  assert.equal(normalizeAttendanceHours(0.3), 0.3);
  assert.equal(normalizeAttendanceHours(1.25), 1.25);
  assert.equal(normalizeAttendanceHours(0.123), 0.12);
  assert.equal(normalizeAttendanceHours(null), null);
  assert.throws(() => normalizeAttendanceHours(-0.1), /0–24/);
  assert.throws(() => normalizeAttendanceHours(25), /0–24/);
});

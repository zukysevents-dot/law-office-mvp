import assert from "node:assert/strict";
import { test } from "node:test";

import {
  POSTPONE_ERRORS,
  POSTPONE_REASON_MAX_LENGTH,
  addToIsoDate,
  clampPostponeReason,
  classifyDeadlineChange,
  formatTaskDeadline,
  minimumPostponeIso,
  parseIsoDate,
  summarizeDeadlineHistory,
  validatePostpone,
} from "./deadline-history";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// --- classifyDeadlineChange --------------------------------------------------

test("classifyDeadlineChange: posun na pozdější datum = odložení", () => {
  assert.equal(
    classifyDeadlineChange(d("2026-10-12"), d("2026-10-20")),
    "DEADLINE_POSTPONED",
  );
});

test("classifyDeadlineChange: dřívější datum, nastavení i odstranění = změna", () => {
  assert.equal(
    classifyDeadlineChange(d("2026-10-20"), d("2026-10-12")),
    "DEADLINE_CHANGED",
  );
  assert.equal(classifyDeadlineChange(null, d("2026-10-12")), "DEADLINE_CHANGED");
  assert.equal(classifyDeadlineChange(d("2026-10-12"), null), "DEADLINE_CHANGED");
});

test("classifyDeadlineChange: stejný den nebo obě prázdná = žádná změna", () => {
  assert.equal(classifyDeadlineChange(d("2026-10-12"), d("2026-10-12")), null);
  assert.equal(
    classifyDeadlineChange(
      new Date("2026-10-12T00:00:00.000Z"),
      new Date("2026-10-12T15:00:00.000Z"),
    ),
    null,
  );
  assert.equal(classifyDeadlineChange(null, null), null);
  assert.equal(classifyDeadlineChange(undefined, null), null);
});

// --- validatePostpone ---------------------------------------------------------

const base = {
  currentDeadline: d("2026-10-12"),
  todayIso: "2026-10-05",
  closed: false,
};

test("validatePostpone: chybějící a neplatné datum", () => {
  assert.deepEqual(validatePostpone({ ...base, newDeadlineIso: "" }), {
    ok: false,
    error: POSTPONE_ERRORS.missing,
  });
  assert.deepEqual(validatePostpone({ ...base, newDeadlineIso: "2026-02-30" }), {
    ok: false,
    error: POSTPONE_ERRORS.invalid,
  });
  assert.deepEqual(validatePostpone({ ...base, newDeadlineIso: "zítra" }), {
    ok: false,
    error: POSTPONE_ERRORS.invalid,
  });
});

test("validatePostpone: nový termín musí být pozdější než současný", () => {
  for (const value of ["2026-10-12", "2026-10-10"]) {
    const result = validatePostpone({ ...base, newDeadlineIso: value });
    assert.equal(result.ok, false);
    assert.equal(
      !result.ok && result.error,
      "Nový termín musí být pozdější než současný termín (12. 10. 2026). Dřívější termín nastavte v úpravě úkolu.",
    );
  }
});

test("validatePostpone: nový termín v minulosti (úkol po termínu)", () => {
  const result = validatePostpone({
    currentDeadline: d("2026-09-01"),
    newDeadlineIso: "2026-09-20",
    todayIso: "2026-10-05",
    closed: false,
  });
  assert.deepEqual(result, { ok: false, error: POSTPONE_ERRORS.past });
});

test("validatePostpone: dokončený / archivovaný úkol a úkol bez termínu", () => {
  assert.deepEqual(
    validatePostpone({ ...base, closed: true, newDeadlineIso: "2026-10-20" }),
    { ok: false, error: POSTPONE_ERRORS.closed },
  );
  assert.deepEqual(
    validatePostpone({ ...base, currentDeadline: null, newDeadlineIso: "2026-10-20" }),
    { ok: false, error: POSTPONE_ERRORS.noDeadline },
  );
});

test("validatePostpone: platné odložení vrátí datum na UTC půlnoci", () => {
  const result = validatePostpone({ ...base, newDeadlineIso: "2026-10-20" });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.newDeadline.toISOString(), "2026-10-20T00:00:00.000Z");
  // Dnešek je povolený, pokud je pozdější než současný termín.
  const today = validatePostpone({
    currentDeadline: d("2026-10-01"),
    newDeadlineIso: "2026-10-05",
    todayIso: "2026-10-05",
    closed: false,
  });
  assert.equal(today.ok, true);
});

// --- summarizeDeadlineHistory -------------------------------------------------

test("summarizeDeadlineHistory: bez událostí", () => {
  assert.deepEqual(summarizeDeadlineHistory([]), {
    originalDeadline: null,
    postponeCount: 0,
    changed: false,
  });
});

test("summarizeDeadlineHistory: původní termín = první oldDeadline, počet odložení", () => {
  const summary = summarizeDeadlineHistory([
    {
      type: "DEADLINE_POSTPONED",
      oldDeadline: d("2026-10-20"),
      newDeadline: d("2026-10-27"),
      createdAt: new Date("2026-10-06T10:00:00Z"),
    },
    {
      type: "DUPLICATED_TO",
      oldDeadline: null,
      newDeadline: null,
      createdAt: new Date("2026-10-04T10:00:00Z"),
    },
    {
      type: "DEADLINE_POSTPONED",
      oldDeadline: d("2026-10-12"),
      newDeadline: d("2026-10-20"),
      createdAt: new Date("2026-10-05T10:00:00Z"),
    },
    {
      type: "DEADLINE_CHANGED",
      oldDeadline: d("2026-10-27"),
      newDeadline: d("2026-10-25"),
      createdAt: new Date("2026-10-07T10:00:00Z"),
    },
  ]);
  assert.equal(summary.originalDeadline?.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(summary.postponeCount, 2);
  assert.equal(summary.changed, true);
});

test("summarizeDeadlineHistory: úkol termín původně neměl", () => {
  const summary = summarizeDeadlineHistory([
    {
      type: "DEADLINE_CHANGED",
      oldDeadline: null,
      newDeadline: d("2026-10-12"),
      createdAt: new Date("2026-10-05T10:00:00Z"),
    },
  ]);
  assert.equal(summary.originalDeadline, null);
  assert.equal(summary.postponeCount, 0);
  assert.equal(summary.changed, true);
});

// --- datumové pomocníky ---------------------------------------------------------

test("addToIsoDate: dny, týdny, měsíce a konec měsíce", () => {
  assert.equal(addToIsoDate("2026-10-12", { days: 7 }), "2026-10-19");
  assert.equal(addToIsoDate("2026-12-28", { days: 14 }), "2027-01-11");
  assert.equal(addToIsoDate("2026-10-12", { months: 1 }), "2026-11-12");
  assert.equal(addToIsoDate("2026-01-31", { months: 1 }), "2026-02-28");
  assert.equal(addToIsoDate("2028-01-31", { months: 1 }), "2028-02-29");
  assert.equal(addToIsoDate("2026-12-15", { months: 1 }), "2027-01-15");
  assert.equal(addToIsoDate("nesmysl", { days: 1 }), "");
});

test("minimumPostponeIso: pozdější z dneška a současného termínu + 1 den", () => {
  assert.equal(minimumPostponeIso("2026-10-12", "2026-10-05"), "2026-10-13");
  assert.equal(minimumPostponeIso("2026-09-01", "2026-10-05"), "2026-10-05");
  assert.equal(minimumPostponeIso("", "2026-10-05"), "2026-10-05");
});

test("parseIsoDate a formatTaskDeadline", () => {
  assert.equal(parseIsoDate("2026-10-03")?.toISOString(), "2026-10-03T00:00:00.000Z");
  assert.equal(parseIsoDate("2026-13-03"), null);
  assert.equal(parseIsoDate(null), null);
  assert.equal(formatTaskDeadline(d("2026-10-03")), "03. 10. 2026");
  assert.equal(formatTaskDeadline(null), "—");
});

test("clampPostponeReason: ořez a prázdný důvod", () => {
  assert.equal(clampPostponeReason("  "), null);
  assert.equal(clampPostponeReason(null), null);
  assert.equal(clampPostponeReason(" čekáme na klienta "), "čekáme na klienta");
  assert.equal(
    clampPostponeReason("x".repeat(POSTPONE_REASON_MAX_LENGTH + 50))?.length,
    POSTPONE_REASON_MAX_LENGTH,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { mapAresToSubjectFields } from "./mapper";

test("mapAresToSubjectFields: legal forms 100–109 are natural persons", () => {
  const fop = mapAresToSubjectFields({
    ico: "12345678",
    obchodniJmeno: "Petr Dvořák – Truhlářství",
    pravniForma: "101",
  });
  assert.equal(fop.isNaturalPerson, true);
  assert.equal(fop.tradeName, "Petr Dvořák – Truhlářství");
  assert.equal(
    fop.legalForm,
    "Fyzická osoba podnikající dle živnostenského zákona",
  );

  const company = mapAresToSubjectFields({
    ico: "12345678",
    obchodniJmeno: "ABC s.r.o.",
    pravniForma: "112",
  });
  assert.equal(company.isNaturalPerson, false);

  const unknown = mapAresToSubjectFields({ ico: "1", obchodniJmeno: "X" });
  assert.equal(unknown.isNaturalPerson, false);
});

test("mapAresToSubjectFields: risk signals unchanged", () => {
  const fields = mapAresToSubjectFields({
    ico: "12345678",
    obchodniJmeno: "XYZ s.r.o. v likvidaci",
    seznamRegistraci: { stavZdrojeIr: "AKTIVNI" },
  });
  assert.equal(fields.riskFlag, true);
  assert.deepEqual(
    fields.riskSignals.map((signal) => signal.type),
    ["INSOLVENCY", "LIQUIDATION"],
  );
});

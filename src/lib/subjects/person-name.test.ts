import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capitalizeName,
  composePersonName,
  composeSubjectName,
  personPartOfTradeName,
  screeningName,
  splitPersonName,
} from "./person-name";

test("composePersonName: titles before and after", () => {
  assert.equal(
    composePersonName({
      titleBefore: "JUDr.",
      firstName: "Jan",
      lastName: "Novák",
      titleAfter: "Ph.D.",
    }),
    "JUDr. Jan Novák, Ph.D.",
  );
  assert.equal(composePersonName({ firstName: " Jan ", lastName: "Novák" }), "Jan Novák");
  assert.equal(composePersonName({}), "");
});

test("composeSubjectName: per subject type", () => {
  const parts = { firstName: "Petr", lastName: "Dvořák" };
  assert.equal(composeSubjectName("PERSON", { ...parts, name: "x" }), "Petr Dvořák");
  assert.equal(
    composeSubjectName("ENTREPRENEUR", { ...parts, tradeName: "Petr Dvořák – Truhlářství" }),
    "Petr Dvořák – Truhlářství",
  );
  assert.equal(
    composeSubjectName("ENTREPRENEUR", { ...parts, tradeName: "Petr Dvořák" }),
    "Petr Dvořák",
  );
  assert.equal(composeSubjectName("ENTREPRENEUR", parts), "Petr Dvořák");
  assert.equal(composeSubjectName("COMPANY", { ...parts, name: " ABC s.r.o. " }), "ABC s.r.o.");
});

test("splitPersonName: strips titles, last word is the surname", () => {
  assert.deepEqual(splitPersonName("JUDr. Jan Novák, Ph.D."), {
    titleBefore: "JUDr.",
    firstName: "Jan",
    lastName: "Novák",
    titleAfter: "Ph.D.",
  });
  assert.deepEqual(splitPersonName("Ing. Mgr. Jana Marie Nováková"), {
    titleBefore: "Ing. Mgr.",
    firstName: "Jana Marie",
    lastName: "Nováková",
    titleAfter: "",
  });
  assert.deepEqual(splitPersonName("Novák"), {
    titleBefore: "",
    firstName: "",
    lastName: "Novák",
    titleAfter: "",
  });
  assert.equal(splitPersonName("Jan Novák MBA").titleAfter, "MBA");
  assert.equal(splitPersonName("").lastName, "");
});

test("capitalizeName: ARES upper-case names", () => {
  assert.equal(capitalizeName("ALEŠ"), "Aleš");
  assert.equal(capitalizeName("KREJČÍŘ"), "Krejčíř");
  assert.equal(capitalizeName("NOVÁK-DVOŘÁK"), "Novák-Dvořák");
  assert.equal(capitalizeName("JAN PAVEL"), "Jan Pavel");
  assert.equal(capitalizeName("McDonald"), "McDonald");
});

test("screeningName: persons without titles, companies by name", () => {
  assert.equal(
    screeningName({ type: "PERSON", name: "JUDr. Jan Novák", firstName: "Jan", lastName: "Novák" }),
    "Jan Novák",
  );
  assert.equal(screeningName({ type: "COMPANY", name: "ABC s.r.o." }), "ABC s.r.o.");
  assert.equal(screeningName({ type: "PERSON", name: "Jan Novák" }), "Jan Novák");
});

test("personPartOfTradeName: drops the business suffix", () => {
  assert.equal(personPartOfTradeName("Petr Dvořák – Truhlářství"), "Petr Dvořák");
  assert.equal(personPartOfTradeName("Ing. Petr Dvořák, Ph.D."), "Ing. Petr Dvořák, Ph.D.");
  assert.equal(personPartOfTradeName("Petr Dvořák - stolařství"), "Petr Dvořák");
});

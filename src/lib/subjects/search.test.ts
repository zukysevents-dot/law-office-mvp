import assert from "node:assert/strict";
import { test } from "node:test";

import { subjectMatchReasons, subjectSearchWhere } from "./search";

type Or = { OR: Array<Record<string, unknown>> };

test("subjectSearchWhere: empty query is no filter", () => {
  assert.deepEqual(subjectSearchWhere("  "), {});
});

test("subjectSearchWhere: text query covers names, contacts and statutory bodies", () => {
  const where = subjectSearchWhere("Novák") as Or;
  const keys = where.OR.map((clause) => Object.keys(clause)[0]);
  assert.deepEqual(keys, [
    "name",
    "ico",
    "firstName",
    "lastName",
    "tradeName",
    "email",
    "contacts",
    "statutoryBodies",
  ]);
});

test("subjectSearchWhere: phone query matches digits regardless of spacing", () => {
  const where = subjectSearchWhere("777 123 456") as Or;
  const phone = where.OR.find(
    (clause) =>
      JSON.stringify(clause).includes('"type":"PHONE"') &&
      !JSON.stringify(clause).includes('"not"'),
  );
  assert.deepEqual(phone, {
    contacts: { some: { type: "PHONE", valueNormalized: { contains: "777123456" } } },
  });
  // Too short to be a phone search.
  assert.equal(
    (subjectSearchWhere("12") as Or).OR.some((clause) =>
      JSON.stringify(clause).includes('"type":"PHONE"}'),
    ),
    false,
  );
});

test("subjectSearchWhere: exact birth number only for RČ-shaped queries", () => {
  const where = subjectSearchWhere("8001010006") as Or;
  assert.deepEqual(where.OR.at(-1), { birthNumber: "800101/0006" });
  assert.equal(
    (subjectSearchWhere("800101") as Or).OR.some((clause) => "birthNumber" in clause),
    false,
  );
});

test("subjectMatchReasons: explains non-name matches, masks the RČ", () => {
  const subject = {
    name: "ABC s.r.o.",
    contacts: [
      { type: "EMAIL", value: "fakturace@abc.cz", valueNormalized: "fakturace@abc.cz" },
      { type: "PHONE", value: "+420 777 123 456", valueNormalized: "420777123456" },
    ],
    statutoryBodies: [{ name: "Jan Novák" }],
  };
  assert.deepEqual(subjectMatchReasons(subject, "fakturace@"), ["e-mail fakturace@abc.cz"]);
  assert.deepEqual(subjectMatchReasons(subject, "777123456"), ["telefon +420 777 123 456"]);
  assert.deepEqual(subjectMatchReasons(subject, "novák"), ["statutární orgán Jan Novák"]);
  assert.deepEqual(subjectMatchReasons(subject, "ABC"), []);

  const person = { name: "Jan Novák", birthNumber: "800101/0006" };
  assert.deepEqual(subjectMatchReasons(person, "800101/0006"), [
    "rodné číslo ••••••/••06",
  ]);
});

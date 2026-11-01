import assert from "node:assert/strict";
import { test } from "node:test";

import type { AresVrRaw } from "./client";
import { mapAresStatutoryBodies } from "./statutory";

// Anonymized excerpt of a real `/ekonomicke-subjekty-vr/{ico}` response
// (structure verified against ARES; names, dates and IČO are fictitious).
const fixture: AresVrRaw = {
  icoId: "12345678",
  zaznamy: [
    { primarniZaznam: false, statutarniOrgany: [{ nazevOrganu: "Starý", clenoveOrganu: [] }] },
    {
      primarniZaznam: true,
      statutarniOrgany: [
        {
          datumZapisu: "2003-08-26",
          nazevOrganu: "Statutární orgán - představenstvo",
          zpusobJednani: [
            { datumZapisu: "2003-08-26", datumVymazu: "2006-05-17", hodnota: "Staré jednání." },
            {
              datumZapisu: "2022-08-15",
              hodnota: "Za společnost jedná předseda představenstva samostatně.",
            },
          ],
          clenoveOrganu: [
            {
              datumZapisu: "2013-07-18",
              datumVymazu: "2013-11-12",
              clenstvi: { funkce: { nazev: "člen představenstva" } },
              fyzickaOsoba: { jmeno: "BÝVALÝ", prijmeni: "ČLEN" },
            },
            {
              datumZapisu: "2022-11-16",
              nazevAngazma: "Člen statutárního orgánu",
              clenstvi: {
                clenstvi: { vznikClenstvi: "2022-11-09" },
                funkce: { vznikFunkce: "2022-11-16", nazev: "Předseda představenstva" },
              },
              fyzickaOsoba: { jmeno: "ALEŠ", prijmeni: "TESTOVACÍ", titulPredJmenem: "Ing." },
            },
            {
              datumZapisu: "2025-03-31",
              nazevAngazma: "Člen statutárního orgánu",
              clenstvi: { clenstvi: { vznikClenstvi: "2025-03-31" } },
              fyzickaOsoba: { jmeno: "JANA", prijmeni: "UKÁZKOVÁ", titulZaJmenem: "Ph.D." },
            },
            {
              datumZapisu: "2024-01-02",
              pravnickaOsoba: { obchodniJmeno: "Holding Příklad a.s.", ico: "123456" },
            },
          ],
        },
        {
          nazevOrganu: "Vymazaný orgán",
          datumVymazu: "2010-01-01",
          clenoveOrganu: [{ fyzickaOsoba: { jmeno: "X", prijmeni: "Y" } }],
        },
      ],
    },
  ],
};

test("mapAresStatutoryBodies: current members of the primary record", () => {
  assert.deepEqual(mapAresStatutoryBodies(fixture), [
    {
      name: "Ing. Aleš Testovací",
      function: "předseda představenstva",
      actingMethod: "Za společnost jedná předseda představenstva samostatně.",
      validFrom: "2022-11-16",
      ico: null,
    },
    {
      name: "Jana Ukázková, Ph.D.",
      function: "člen statutárního orgánu",
      actingMethod: "Za společnost jedná předseda představenstva samostatně.",
      validFrom: "2025-03-31",
      ico: null,
    },
    {
      name: "Holding Příklad a.s.",
      function: "statutární orgán - představenstvo",
      actingMethod: "Za společnost jedná předseda představenstva samostatně.",
      validFrom: "2024-01-02",
      ico: "00123456",
    },
  ]);
});

test("mapAresStatutoryBodies: tolerates missing or malformed payloads", () => {
  assert.deepEqual(mapAresStatutoryBodies(null), []);
  assert.deepEqual(mapAresStatutoryBodies({}), []);
  assert.deepEqual(
    mapAresStatutoryBodies({ zaznamy: [{ statutarniOrgany: null }] } as AresVrRaw),
    [],
  );
  assert.deepEqual(
    mapAresStatutoryBodies({
      zaznamy: [{ primarniZaznam: true, statutarniOrgany: [{ clenoveOrganu: [{}] }] }],
    }),
    [],
  );
});

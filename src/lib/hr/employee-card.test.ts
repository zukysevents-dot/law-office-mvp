import assert from "node:assert/strict";
import { test } from "node:test";

import { splitPersonName } from "./employee-card";

test("splitPersonName: poslední slovo je příjmení, tituly zůstanou u jména", () => {
  assert.deepEqual(splitPersonName("Mgr. Adam Ledina"), {
    firstName: "Mgr. Adam",
    lastName: "Ledina",
  });
  assert.deepEqual(splitPersonName("  Jana   Nováková "), {
    firstName: "Jana",
    lastName: "Nováková",
  });
});

test("splitPersonName: jedno slovo nebo prázdné jméno", () => {
  assert.deepEqual(splitPersonName("Paralegal"), {
    firstName: "Paralegal",
    lastName: "",
  });
  assert.deepEqual(splitPersonName("   "), { firstName: "", lastName: "" });
});

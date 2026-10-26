import assert from "node:assert/strict";
import { test } from "node:test";

import { reportCopy } from "./copy";

test("reportCopy keeps the text for viewers with amounts", () => {
  const text = "Odpracované hodiny a částky po měsících.";
  assert.equal(reportCopy(text, true), text);
});

test("reportCopy drops amounts for viewers without rates", () => {
  assert.equal(
    reportCopy("Odpracované hodiny a částky z viditelných výkazů práce po měsících.", false),
    "Odpracované hodiny z viditelných výkazů práce po měsících.",
  );
  assert.equal(
    reportCopy("Hodiny, částky a právní oblasti rozdělené podle týmů.", false),
    "Hodiny a právní oblasti rozdělené podle týmů.",
  );
  assert.equal(
    reportCopy("Výkon týmů podle období, hodin, částky a právních oblastí.", false),
    "Výkon týmů podle období, hodin a právních oblastí.",
  );
  assert.equal(
    reportCopy("Podíl fakturovatelných hodin na odpracovaných.", false),
    "Podíl fakturovatelných hodin na odpracovaných.",
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { AmlRiskLevel } from "@/generated/prisma/enums";

import { deriveRiskFlag, maskDocumentNumber } from "./aml";

test("deriveRiskFlag: HIGH risk is flagged", () => {
  assert.equal(deriveRiskFlag(AmlRiskLevel.HIGH, false, false), true);
});

test("deriveRiskFlag: PEP is flagged regardless of level", () => {
  assert.equal(deriveRiskFlag(AmlRiskLevel.LOW, true, false), true);
});

test("deriveRiskFlag: sanctions match is flagged", () => {
  assert.equal(deriveRiskFlag(AmlRiskLevel.MEDIUM, false, true), true);
});

test("deriveRiskFlag: LOW/MEDIUM without PEP/sanctions is not flagged", () => {
  assert.equal(deriveRiskFlag(AmlRiskLevel.LOW, false, false), false);
  assert.equal(deriveRiskFlag(AmlRiskLevel.MEDIUM, false, false), false);
});

test("maskDocumentNumber: keeps only the last 4 characters", () => {
  assert.equal(maskDocumentNumber("123456789"), "••••6789");
});

test("maskDocumentNumber: short value masks all but the last char", () => {
  assert.equal(maskDocumentNumber("AB12"), "•••2");
  assert.equal(maskDocumentNumber("X9"), "•9");
  assert.equal(maskDocumentNumber("7"), "7");
});

test("maskDocumentNumber: empty stays empty and trims whitespace", () => {
  assert.equal(maskDocumentNumber("   "), "");
  assert.equal(maskDocumentNumber("  123456  "), "••••3456");
});

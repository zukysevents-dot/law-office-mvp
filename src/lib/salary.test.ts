import assert from "node:assert/strict";
import { test } from "node:test";

import { SalaryTaxMode } from "@/generated/prisma/enums";

import {
  MAX_GROSS_SALARY_CZK,
  parseSalaryTaxMode,
  validateGrossSalary,
} from "./salary";

// --- validateGrossSalary -----------------------------------------------------

test("validateGrossSalary: null (prázdné pole) → null, žádná výjimka", () => {
  assert.equal(validateGrossSalary(null), null);
});

test("validateGrossSalary: nula je validní (0 Kč)", () => {
  assert.equal(validateGrossSalary(0), 0);
});

test("validateGrossSalary: běžná kladná mzda projde beze změny", () => {
  assert.equal(validateGrossSalary(85_000), 85_000);
});

test("validateGrossSalary: desetinné číslo (čárka už rozparsovaná) projde", () => {
  // optionalNumber převede "85000,50" → 85000.5; tady jen ověřujeme rozsah.
  assert.equal(validateGrossSalary(85_000.5), 85_000.5);
});

test("validateGrossSalary: záporná mzda → throw", () => {
  assert.throws(() => validateGrossSalary(-1), /Neplatná výše mzdy/);
  assert.throws(() => validateGrossSalary(-0.01), /Neplatná výše mzdy/);
});

test("validateGrossSalary: hodnota přesně na horním limitu projde", () => {
  assert.equal(
    validateGrossSalary(MAX_GROSS_SALARY_CZK),
    MAX_GROSS_SALARY_CZK,
  );
});

test("validateGrossSalary: nad limit (>99M, např. zadané v haléřích) → throw", () => {
  assert.throws(
    () => validateGrossSalary(MAX_GROSS_SALARY_CZK + 1),
    /Neplatná výše mzdy/,
  );
  assert.throws(() => validateGrossSalary(1_000_000_000), /Neplatná výše mzdy/);
});

// --- parseSalaryTaxMode ------------------------------------------------------

test("parseSalaryTaxMode: prázdné/null/undefined → null (NE default EMPLOYMENT)", () => {
  assert.equal(parseSalaryTaxMode(null), null);
  assert.equal(parseSalaryTaxMode(undefined), null);
  assert.equal(parseSalaryTaxMode(""), null);
  assert.equal(parseSalaryTaxMode("   "), null);
});

test("parseSalaryTaxMode: každá platná hodnota enumu se zachová", () => {
  for (const mode of Object.values(SalaryTaxMode)) {
    assert.equal(parseSalaryTaxMode(mode), mode);
  }
});

test("parseSalaryTaxMode: ořezává obklopující whitespace u platné hodnoty", () => {
  assert.equal(parseSalaryTaxMode("  DPP  "), SalaryTaxMode.DPP);
});

test("parseSalaryTaxMode: neplatný/neznámý enum → fallback EMPLOYMENT (nikdy smetí)", () => {
  // Bezpečné chování: jakmile uživatel něco vyplní, neznámá hodnota se mapuje na
  // EMPLOYMENT — do DB se nikdy neuloží neznámý režim.
  assert.equal(parseSalaryTaxMode("NEEXISTUJE"), SalaryTaxMode.EMPLOYMENT);
  assert.equal(parseSalaryTaxMode("employment"), SalaryTaxMode.EMPLOYMENT); // case-sensitive
  assert.equal(parseSalaryTaxMode("'; DROP TABLE"), SalaryTaxMode.EMPLOYMENT);
});

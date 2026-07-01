import assert from "node:assert/strict";
import { test } from "node:test";

import type { RegistryRiskSignal } from "@/lib/ares/mapper";

import { diffRegistryStatus } from "./registry-monitor";

function fields(signals: RegistryRiskSignal[], riskDataPresent = true) {
  return {
    insolvencyStatus:
      signals.length > 0 ? signals.map((s) => s.label).join("; ") : null,
    riskSignals: signals,
    riskDataPresent,
  };
}

test("diffRegistryStatus: beze změny (stejný status) → null", () => {
  assert.equal(
    diffRegistryStatus(
      "Aktivní záznam v insolvenčním rejstříku",
      fields([{ type: "INSOLVENCY", label: "Aktivní záznam v insolvenčním rejstříku" }]),
    ),
    null,
  );
});

test("diffRegistryStatus: čistý → čistý (null vs null) → null", () => {
  assert.equal(diffRegistryStatus(null, fields([])), null);
});

test("diffRegistryStatus: nová insolvence → INSOLVENCY, raisesRisk true", () => {
  const change = diffRegistryStatus(
    null,
    fields([{ type: "INSOLVENCY", label: "Aktivní záznam v insolvenčním rejstříku" }]),
  );
  assert.equal(change?.changeType, "INSOLVENCY");
  assert.equal(change?.raisesRisk, true);
  assert.equal(change?.oldValue, null);
  assert.match(change?.newValue ?? "", /insolven/);
});

test("diffRegistryStatus: zánik subjektu → DISSOLVED", () => {
  const change = diffRegistryStatus(
    null,
    fields([{ type: "DISSOLVED", label: "Subjekt zanikl (k 01.01.2026)" }]),
  );
  assert.equal(change?.changeType, "DISSOLVED");
  assert.equal(change?.raisesRisk, true);
});

test("diffRegistryStatus: nejzávažnější signál klasifikuje (insolvence > likvidace)", () => {
  const change = diffRegistryStatus(
    null,
    fields([
      { type: "LIQUIDATION", label: "V likvidaci" },
      { type: "INSOLVENCY", label: "Aktivní záznam v insolvenčním rejstříku" },
    ]),
  );
  assert.equal(change?.changeType, "INSOLVENCY");
});

test("diffRegistryStatus: riziko pominulo (potvrzeno daty) → RISK_CLEARED, raisesRisk false", () => {
  const change = diffRegistryStatus(
    "Aktivní záznam v insolvenčním rejstříku",
    fields([], true),
  );
  assert.equal(change?.changeType, "RISK_CLEARED");
  assert.equal(change?.raisesRisk, false);
  assert.equal(change?.newValue, null);
});

test("diffRegistryStatus: chybí registrační data (partial ARES) → NE falešný RISK_CLEARED", () => {
  // Dříve rizikový subjekt, ale ARES nevrátil seznamRegistraci → nelze potvrdit
  // vyčištění → žádná událost.
  assert.equal(
    diffRegistryStatus(
      "Aktivní záznam v insolvenčním rejstříku",
      fields([], false),
    ),
    null,
  );
});

test("diffRegistryStatus: změna obsahu rizika (přibyl signál) → escalace", () => {
  const change = diffRegistryStatus(
    "V likvidaci",
    fields([
      { type: "LIQUIDATION", label: "V likvidaci" },
      { type: "INSOLVENCY", label: "Aktivní záznam v insolvenčním rejstříku" },
    ]),
  );
  assert.notEqual(change, null);
  assert.equal(change?.changeType, "INSOLVENCY");
  assert.equal(change?.raisesRisk, true);
});

test("diffRegistryStatus: whitespace se normalizuje (žádná falešná změna)", () => {
  assert.equal(
    diffRegistryStatus(
      "  V likvidaci  ",
      fields([{ type: "LIQUIDATION", label: "V likvidaci" }]),
    ),
    null,
  );
});

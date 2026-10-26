import assert from "node:assert/strict";
import { test } from "node:test";

import { AUDIT_REDACTED, auditRowForViewer, redactAuditRates } from "./audit-redact";

test("redactAuditRates hides rate and amount fields, nested too", () => {
  assert.deepEqual(
    redactAuditRates({
      name: "Projekt",
      hourlyRate: "2500",
      flatFee: null,
      lines: [{ amountCzk: "100", hours: "1" }],
      reference: { valueCzk: 5000000 },
    }),
    {
      name: "Projekt",
      hourlyRate: AUDIT_REDACTED,
      flatFee: null,
      lines: [{ amountCzk: AUDIT_REDACTED, hours: "1" }],
      reference: { valueCzk: AUDIT_REDACTED },
    },
  );
  assert.equal(redactAuditRates(null), null);
  assert.equal(redactAuditRates("text"), "text");
});

test("auditRowForViewer keeps the row for viewers with rates", () => {
  const row = { id: "1", oldValue: { hourlyRate: "1" }, newValue: { hourlyRate: "2" } };
  assert.equal(auditRowForViewer(row, true), row);
  assert.deepEqual(auditRowForViewer(row, false), {
    id: "1",
    oldValue: { hourlyRate: AUDIT_REDACTED },
    newValue: { hourlyRate: AUDIT_REDACTED },
  });
});

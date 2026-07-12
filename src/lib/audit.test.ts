import assert from "node:assert/strict";
import { test } from "node:test";

import { auditCreateData, auditJson } from "./audit";

test("auditCreateData: always carries the explicit tenant id", () => {
  const data = auditCreateData({
    organizationId: "org-1",
    entityType: "Subject",
    entityId: "subject-1",
    action: "UPDATE",
    changedById: "user-1",
    newValue: { name: "Klient" },
  });

  assert.equal(data.organizationId, "org-1");
  assert.equal(data.changedById, "user-1");
  assert.deepEqual(data.newValue, { name: "Klient" });
});

test("auditCreateData: actor remains nullable without dropping the tenant", () => {
  const data = auditCreateData({
    organizationId: "org-portal",
    entityType: "Document",
    entityId: "document-1",
    action: "PORTAL_VIEW_DOCUMENT",
  });

  assert.equal(data.organizationId, "org-portal");
  assert.equal(data.changedById, null);
});

test("auditJson: converts Date and Decimal-like values to JSON-safe data", () => {
  const data = auditJson({
    at: new Date("2026-07-12T10:00:00.000Z"),
    amount: { toJSON: () => "1250.50" },
  });

  assert.deepEqual(data, {
    at: "2026-07-12T10:00:00.000Z",
    amount: "1250.50",
  });
});

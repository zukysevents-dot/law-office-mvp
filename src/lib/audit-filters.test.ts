import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  auditActionLabels,
  auditEntityTypeLabels,
  buildAuditWhere,
} from "./audit-filters";

test("every filterable audit entity type and action has a Czech label", () => {
  for (const type of AUDIT_ENTITY_TYPES) {
    assert.ok(auditEntityTypeLabels[type], `missing label for ${type}`);
  }
  for (const action of AUDIT_ACTIONS) {
    assert.ok(auditActionLabels[action], `missing label for ${action}`);
  }
});

test("assignment and team changes are filterable", () => {
  assert.equal(auditEntityTypeLabels.ProjectTeamAssignment, "Tým u projektu");
  assert.equal(auditEntityTypeLabels.CaseTeamAssignment, "Tým u případu");
  assert.equal(auditEntityTypeLabels.ProjectAssignee, "Řešitel projektu");
  assert.equal(auditEntityTypeLabels.UserHoursPlan, "Plán hodin (KPI)");
  assert.equal(auditEntityTypeLabels.Performance, "Výkonnost");
  assert.equal(auditActionLabels.ASSIGN, "Přiřazení");
  const where = buildAuditWhere({
    entityType: "ProjectTeamAssignment",
    action: "REMOVE",
    userId: "",
    dateFrom: "",
    dateTo: "",
  });
  assert.deepEqual(where, { entityType: "ProjectTeamAssignment", action: "REMOVE" });
});

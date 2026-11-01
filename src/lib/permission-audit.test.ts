import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPermissionAudit } from "./permission-audit";

test("formatPermissionAudit: role update reads as Czech old → new", () => {
  assert.equal(
    formatPermissionAudit({
      entityType: "RolePermission",
      action: "UPDATE",
      oldValue: { role: "INTERN", changes: { "scope.tasks": "ALL", "module.projects": true } },
      newValue: { role: "INTERN", changes: { "scope.tasks": "ASSIGNED", "module.projects": false } },
    }),
    "Role Praktikant: Úkoly (rozsah dat): Vše v kanceláři → Jen přiřazené; Projekty: Ano → Ne",
  );
});

test("formatPermissionAudit: role reset lists what was reset", () => {
  assert.equal(
    formatPermissionAudit({
      entityType: "RolePermission",
      action: "RESET",
      oldValue: { role: "INTERN", changes: { "module.projects": "DENY" } },
      newValue: { role: "INTERN", changes: {} },
    }),
    "Role Praktikant – obnoveno na výchozí: Projekty: Ne → výchozí",
  );
});

test("formatPermissionAudit: user overrides use Podle role / Povolit / Zakázat", () => {
  assert.equal(
    formatPermissionAudit({
      entityType: "UserPermission",
      action: "UPDATE",
      oldValue: { userId: "u1", changes: { "function.viewRates": "INHERIT" } },
      newValue: { userId: "u1", changes: { "function.viewRates": "ALLOW" } },
    }),
    "Vidí sazby a částky: Podle role → Povolit",
  );
  assert.equal(
    formatPermissionAudit({
      entityType: "UserPermission",
      action: "RESET",
      oldValue: { userId: "u1", changes: { "function.viewRates": "DENY" } },
      newValue: { userId: "u1", changes: {} },
    }),
    "Výjimky zrušeny: Vidí sazby a částky: Zakázat → Podle role",
  );
});

test("formatPermissionAudit: other entities fall back to the raw detail", () => {
  assert.equal(
    formatPermissionAudit({ entityType: "Task", action: "UPDATE", oldValue: null, newValue: {} }),
    null,
  );
});

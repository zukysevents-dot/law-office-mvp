import assert from "node:assert/strict";
import { test } from "node:test";

import { Capability, UserRole } from "@/generated/prisma/enums";

import {
  defaultPermissionsForRole,
  legacyCapabilityForPermission,
  parsePermissionValue,
  resolvePermissions,
  rolePermissionValue,
  serializePermissionValue,
} from "./permission-resolver";
import { getPermissionDef, PERMISSION_CATALOG } from "./permission-catalog";

test("default matrix: everyone sees all subjects, projects, cases and tasks", () => {
  for (const role of Object.values(UserRole)) {
    const perms = defaultPermissionsForRole(role);
    assert.equal(perms["scope.subjects"], "ALL", role);
    assert.equal(perms["scope.projects"], "ALL", role);
    assert.equal(perms["scope.cases"], "ALL", role);
    assert.equal(perms["scope.tasks"], "ALL", role);
    assert.equal(perms["module.subjects"], true, role);
    assert.equal(perms["module.projects"], true, role);
    assert.equal(perms["module.cases"], true, role);
    assert.equal(perms["module.tasks"], true, role);
    assert.equal(perms["module.workLogs"], true, role);
  }
});

test("default matrix: rates stay leadership-only, work-log scope as before", () => {
  assert.equal(defaultPermissionsForRole(UserRole.ADMIN)["function.viewRates"], true);
  assert.equal(defaultPermissionsForRole(UserRole.PARTNER)["function.viewRates"], true);
  for (const role of [UserRole.LAWYER, UserRole.TRAINEE, UserRole.INTERN]) {
    assert.equal(defaultPermissionsForRole(role)["function.viewRates"], false);
  }
  assert.equal(defaultPermissionsForRole(UserRole.LAWYER)["scope.workLogs"], "ASSIGNED");
  assert.equal(defaultPermissionsForRole(UserRole.TRAINEE)["scope.workLogs"], "OWN");
  assert.equal(defaultPermissionsForRole(UserRole.INTERN)["scope.workLogs"], "OWN");
  assert.equal(defaultPermissionsForRole(UserRole.PARTNER)["scope.workLogs"], "ALL");
  assert.equal(defaultPermissionsForRole(UserRole.LAWYER)["function.setBillable"], true);
  assert.equal(defaultPermissionsForRole(UserRole.TRAINEE)["function.setBillable"], false);
  assert.equal(defaultPermissionsForRole(UserRole.LAWYER)["module.billing"], true);
  assert.equal(defaultPermissionsForRole(UserRole.INTERN)["module.billing"], false);
  assert.equal(defaultPermissionsForRole(UserRole.LAWYER)["module.auditLog"], false);
});

test("partner defaults = everything except nothing (today's ADMIN/PARTNER parity)", () => {
  const partner = defaultPermissionsForRole(UserRole.PARTNER);
  for (const def of PERMISSION_CATALOG) {
    assert.equal(
      partner[def.key],
      def.kind === "scope" ? "ALL" : true,
      def.key,
    );
  }
});

test("ADMIN always has everything, overrides are ignored", () => {
  const perms = resolvePermissions({
    role: UserRole.ADMIN,
    roleOverrides: [
      { permission: "module.projects", value: "DENY" },
      { permission: "scope.tasks", value: "ASSIGNED" },
    ],
    userOverrides: [{ permission: "function.managePermissions", value: "DENY" }],
  });
  for (const def of PERMISSION_CATALOG) {
    assert.equal(perms[def.key], def.kind === "scope" ? "ALL" : true, def.key);
  }
});

test("role override replaces the default", () => {
  const perms = resolvePermissions({
    role: UserRole.INTERN,
    roleOverrides: [
      { permission: "scope.tasks", value: "ASSIGNED" },
      { permission: "module.projects", value: "DENY" },
      { permission: "function.viewRates", value: "ALLOW" },
    ],
  });
  assert.equal(perms["scope.tasks"], "ASSIGNED");
  assert.equal(perms["module.projects"], false);
  assert.equal(perms["function.viewRates"], true);
  assert.equal(perms["scope.cases"], "ALL");
});

test("user override wins over role override", () => {
  const perms = resolvePermissions({
    role: UserRole.TRAINEE,
    roleOverrides: [{ permission: "scope.tasks", value: "ASSIGNED" }],
    userOverrides: [
      { permission: "scope.tasks", value: "ALL" },
      { permission: "function.editAllMatters", value: "ALLOW" },
    ],
  });
  assert.equal(perms["scope.tasks"], "ALL");
  assert.equal(perms["function.editAllMatters"], true);
});

test("legacy capability grants allow, an explicit user DENY wins", () => {
  const granted = resolvePermissions({
    role: UserRole.LAWYER,
    legacyCapabilities: [Capability.VIEW_RATES, Capability.MANAGE_INVOICES],
  });
  assert.equal(granted["function.viewRates"], true);
  assert.equal(granted["function.manageInvoices"], true);

  const denied = resolvePermissions({
    role: UserRole.LAWYER,
    legacyCapabilities: [Capability.VIEW_RATES],
    userOverrides: [{ permission: "function.viewRates", value: "DENY" }],
  });
  assert.equal(denied["function.viewRates"], false);

  // A legacy grant also beats a role-level DENY (it is a per-user exception).
  const roleDenied = resolvePermissions({
    role: UserRole.LAWYER,
    roleOverrides: [{ permission: "function.manageInvoices", value: "DENY" }],
    legacyCapabilities: [Capability.MANAGE_INVOICES],
  });
  assert.equal(roleDenied["function.manageInvoices"], true);
});

test("unknown keys and invalid values are ignored", () => {
  const perms = resolvePermissions({
    role: UserRole.INTERN,
    roleOverrides: [
      { permission: "module.nonexistent", value: "ALLOW" },
      { permission: "scope.tasks", value: "OWN" }, // OWN not an option for tasks
      { permission: "module.projects", value: "ALL" }, // scope value on a flag
      { permission: "scope.workLogs", value: "ALLOW" }, // flag value on a scope
    ],
  });
  assert.equal(perms["scope.tasks"], "ALL");
  assert.equal(perms["module.projects"], true);
  assert.equal(perms["scope.workLogs"], "OWN");
  assert.equal(
    Object.prototype.hasOwnProperty.call(perms, "module.nonexistent"),
    false,
  );
});

test("missing or unknown role resolves to nothing (fail closed)", () => {
  for (const role of [null, undefined, "SUPERUSER" as UserRole]) {
    const perms = resolvePermissions({
      role,
      userOverrides: [{ permission: "module.projects", value: "ALLOW" }],
    });
    for (const def of PERMISSION_CATALOG) {
      if (def.kind === "scope") {
        assert.equal(perms[def.key], def.options[def.options.length - 1]);
      } else {
        assert.equal(perms[def.key], false, def.key);
      }
    }
  }
});

test("module.performance exists (package 08 page)", () => {
  const perms = defaultPermissionsForRole(UserRole.PARTNER);
  assert.equal(perms["module.performance"], true);
  assert.equal(defaultPermissionsForRole(UserRole.INTERN)["module.performance"], false);
});

test("resolved permissions are frozen", () => {
  const perms = resolvePermissions({ role: UserRole.LAWYER });
  assert.equal(Object.isFrozen(perms), true);
});

test("value (de)serialization round-trips", () => {
  const flag = getPermissionDef("function.viewRates")!;
  const scope = getPermissionDef("scope.workLogs")!;
  assert.equal(parsePermissionValue(flag, serializePermissionValue(true)), true);
  assert.equal(parsePermissionValue(flag, serializePermissionValue(false)), false);
  assert.equal(parsePermissionValue(scope, serializePermissionValue("OWN")), "OWN");
  assert.equal(parsePermissionValue(scope, "ALLOW"), undefined);
});

test("rolePermissionValue applies only role overrides", () => {
  assert.equal(
    rolePermissionValue(UserRole.INTERN, "scope.tasks", [
      { permission: "scope.tasks", value: "ASSIGNED" },
    ]),
    "ASSIGNED",
  );
  assert.equal(rolePermissionValue(UserRole.INTERN, "scope.tasks", []), "ALL");
});

test("legacyCapabilityForPermission maps both legacy grants", () => {
  assert.equal(legacyCapabilityForPermission("function.viewRates"), Capability.VIEW_RATES);
  assert.equal(
    legacyCapabilityForPermission("function.manageInvoices"),
    Capability.MANAGE_INVOICES,
  );
  assert.equal(legacyCapabilityForPermission("function.manageHr"), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { ModuleKey, UserRole } from "@/generated/prisma/enums";

import {
  EDITABLE_ROLES,
  FUNCTION_PERMISSION_KEYS,
  MODULE_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  SCOPE_PERMISSION_KEYS,
  editablePermissionDefs,
  isPermissionKey,
  isValidPermissionValue,
} from "./permission-catalog";

test("catalog keys are unique and match the key lists", () => {
  const keys = PERMISSION_CATALOG.map((def) => def.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(
    [...keys].sort(),
    [
      ...MODULE_PERMISSION_KEYS,
      ...SCOPE_PERMISSION_KEYS,
      ...FUNCTION_PERMISSION_KEYS,
    ].sort(),
  );
});

test("every permission has a label, description and kind-matching key prefix", () => {
  for (const def of PERMISSION_CATALOG) {
    assert.ok(def.label.trim().length > 0, def.key);
    assert.ok(def.description.trim().length > 0, def.key);
    assert.ok(def.key.startsWith(`${def.kind}.`), def.key);
  }
});

test("every permission has defaults for all five roles", () => {
  for (const def of PERMISSION_CATALOG) {
    for (const role of Object.values(UserRole)) {
      assert.notEqual(def.defaults[role], undefined, `${def.key} ${role}`);
    }
  }
});

test("scope defaults are among the scope's options", () => {
  for (const def of PERMISSION_CATALOG) {
    if (def.kind !== "scope") continue;
    assert.equal(def.options[0], "ALL", def.key);
    for (const role of Object.values(UserRole)) {
      assert.ok(def.options.includes(def.defaults[role]), `${def.key} ${role}`);
    }
  }
});

test("ADMIN defaults are always true / ALL", () => {
  for (const def of PERMISSION_CATALOG) {
    assert.equal(
      def.defaults[UserRole.ADMIN],
      def.kind === "scope" ? "ALL" : true,
      def.key,
    );
  }
});

test("module permissions carry a valid entitlement", () => {
  const moduleKeys = Object.values(ModuleKey) as string[];
  for (const def of PERMISSION_CATALOG) {
    if (def.kind !== "module") continue;
    assert.ok(moduleKeys.includes(def.entitlement), def.key);
  }
});

test("only managePermissions is admin-only editable", () => {
  const adminOnly = PERMISSION_CATALOG.filter(
    (def) => def.kind === "function" && def.adminOnlyEdit,
  ).map((def) => def.key);
  assert.deepEqual(adminOnly, ["function.managePermissions"]);
});

test("ADMIN column is not editable, other roles are", () => {
  assert.equal(EDITABLE_ROLES.includes(UserRole.ADMIN), false);
  assert.equal(EDITABLE_ROLES.length, 4);
});

test("coming-soon permissions are hidden from the matrix", () => {
  const editable = editablePermissionDefs().map((def) => def.key);
  assert.equal(editable.includes("module.performance"), false);
  assert.equal(editable.includes("module.projects"), true);
});

test("value validation follows the permission kind", () => {
  assert.equal(isValidPermissionValue("module.projects", "ALLOW"), true);
  assert.equal(isValidPermissionValue("module.projects", "DENY"), true);
  assert.equal(isValidPermissionValue("module.projects", "ALL"), false);
  assert.equal(isValidPermissionValue("scope.tasks", "ASSIGNED"), true);
  assert.equal(isValidPermissionValue("scope.tasks", "OWN"), false);
  assert.equal(isValidPermissionValue("scope.workLogs", "OWN"), true);
  assert.equal(isValidPermissionValue("nope", "ALLOW"), false);
  assert.equal(isPermissionKey("function.viewRates"), true);
  assert.equal(isPermissionKey("function.nope"), false);
});

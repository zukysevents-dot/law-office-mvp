import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "./password";

test("hashPassword/verifyPassword: round-trips the correct password", async () => {
  const stored = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter2", stored), true);
});

test("verifyPassword: rejects the wrong password", async () => {
  const stored = await hashPassword("hunter2");
  assert.equal(await verifyPassword("hunter3", stored), false);
});

test("hashPassword: uses the scrypt$salt$hash format", async () => {
  const stored = await hashPassword("x");
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
});

test("hashPassword: salts — same password hashes differently each time", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
});

test("verifyPassword: false for empty/null/garbage stored values", async () => {
  assert.equal(await verifyPassword("x", null), false);
  assert.equal(await verifyPassword("x", undefined), false);
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "bcrypt$salt$hash"), false);
  assert.equal(await verifyPassword("x", "notavalidformat"), false);
});

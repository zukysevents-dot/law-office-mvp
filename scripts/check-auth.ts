// Self-check for the auth crypto. Run: npx tsx scripts/check-auth.ts
// No framework — asserts the password hash and session-cookie paths, including
// the failure cases (wrong password, tampered/expired/garbage tokens).
process.env.SESSION_SECRET ||= "test-secret-at-least-32-characters-long!";

import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../src/lib/password";
import { signSession, verifySession } from "../src/lib/session";

async function main() {
  // Password hashing
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("anything", "not-a-valid-hash"), false);

  // Session signing / verification
  const token = await signSession("user_123");
  assert.equal(await verifySession(token), "user_123");
  assert.equal(await verifySession(token + "x"), null, "tampered signature");
  assert.equal(await verifySession("a.b.c"), null, "garbage token");
  assert.equal(await verifySession(undefined), null, "missing token");
  assert.equal(await verifySession(await signSession("u", -10)), null, "expired");

  console.log("auth self-check OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

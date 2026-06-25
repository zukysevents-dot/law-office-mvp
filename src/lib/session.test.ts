import assert from "node:assert/strict";
import { test } from "node:test";

import { signSession, verifySession } from "./session";

test("signSession/verifySession: round-trips a userId", async () => {
  const token = await signSession("user-123");
  assert.equal(await verifySession(token), "user-123");
});

test("verifySession: rejects a tampered signature", async () => {
  const token = await signSession("user-123");
  const [userId, exp, sig] = token.split(".");
  // Flip the FIRST signature char — its 6 bits are all meaningful. (The LAST
  // base64url char of a 32-byte HMAC carries 2 unused bits, so flipping it can
  // decode to the same bytes and still verify — which made this test flaky.)
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(await verifySession(`${userId}.${exp}.${flipped}`), null);
});

test("verifySession: rejects a tampered payload (userId swap)", async () => {
  const token = await signSession("user-123");
  const [, exp, sig] = token.split(".");
  // Re-assemble with a different userId but the original signature.
  assert.equal(await verifySession(`attacker.${exp}.${sig}`), null);
});

test("verifySession: rejects malformed / empty tokens", async () => {
  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(null), null);
  assert.equal(await verifySession(""), null);
  assert.equal(await verifySession("only.two"), null);
  assert.equal(await verifySession("a.b.c.d"), null);
});

test("verifySession: rejects an expired token", async () => {
  const expired = await signSession("user-123", -10); // exp 10s in the past
  assert.equal(await verifySession(expired), null);
});

test("verifySession: fails closed on undecodable signature", async () => {
  assert.equal(await verifySession("user.9999999999.@@@not-base64@@@"), null);
});

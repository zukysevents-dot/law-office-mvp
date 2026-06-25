import assert from "node:assert/strict";
import { test } from "node:test";

import { generatePortalToken, hashPortalToken } from "./portal-token";

test("generatePortalToken: URL-safe, high-entropy, unique per call", () => {
  const a = generatePortalToken();
  const b = generatePortalToken();
  // base64url of 32 bytes ≈ 43 chars, only [A-Za-z0-9_-].
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 40);
  assert.notEqual(a, b);
});

test("hashPortalToken: deterministic, hex, never the plaintext", () => {
  const token = generatePortalToken();
  const h1 = hashPortalToken(token);
  const h2 = hashPortalToken(token);
  assert.equal(h1, h2); // deterministic → equality lookup works
  assert.match(h1, /^[0-9a-f]{64}$/); // sha256 hex
  assert.notEqual(h1, token); // hash, not plaintext
});

test("hashPortalToken: different tokens → different hashes", () => {
  assert.notEqual(
    hashPortalToken(generatePortalToken()),
    hashPortalToken(generatePortalToken()),
  );
});

test("hashPortalToken: empty string still yields valid sha256 hex (degenerate input)", () => {
  // An empty/degenerate token must not crash or collapse to an empty/falsy
  // value — it produces a normal 64-char hex digest, distinct from any real
  // token's hash, so a blank lookup can never accidentally match a stored hash.
  const h = hashPortalToken("");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, hashPortalToken(generatePortalToken()));
});

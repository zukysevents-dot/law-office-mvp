import assert from "node:assert/strict";
import { test } from "node:test";

import { signPortalSession, verifyPortalSession } from "./portal-session";

test("verifyPortalSession: round-trips a valid signed session id", () => {
  const token = signPortalSession("sess-123", 600);
  assert.equal(verifyPortalSession(token), "sess-123");
});

test("verifyPortalSession: rejects a tampered signature", () => {
  const token = signPortalSession("sess-123", 600);
  const tampered = `${token.slice(0, -2)}xy`;
  assert.equal(verifyPortalSession(tampered), null);
});

test("verifyPortalSession: rejects a tampered sessionId (signature mismatch)", () => {
  const token = signPortalSession("sess-123", 600);
  const [, exp, sig] = token.split(".");
  assert.equal(verifyPortalSession(`sess-456.${exp}.${sig}`), null);
});

test("verifyPortalSession: rejects an expired token", () => {
  const expired = signPortalSession("sess-123", -10);
  assert.equal(verifyPortalSession(expired), null);
});

test("verifyPortalSession: rejects malformed / empty input (fail closed)", () => {
  assert.equal(verifyPortalSession(undefined), null);
  assert.equal(verifyPortalSession(null), null);
  assert.equal(verifyPortalSession(""), null);
  assert.equal(verifyPortalSession("only.two"), null);
  assert.equal(verifyPortalSession("a.b.c.d"), null);
});

test("signPortalSession: token shape is `sessionId.exp.sig` with base64url sig", () => {
  const token = signPortalSession("sess-abc", 600);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const [sessionId, exp, sig] = parts;
  assert.equal(sessionId, "sess-abc");
  // exp is a future unix-seconds integer.
  assert.match(exp, /^\d+$/);
  assert.ok(Number(exp) * 1000 > Date.now());
  // The cookie is stored/transmitted, so the signature must be URL-safe
  // (base64url: no '+', '/', or '=' padding).
  assert.match(sig, /^[A-Za-z0-9_-]+$/);
});

test("signPortalSession: a longer ttl encodes a later expiry than a short one", () => {
  const shortTok = signPortalSession("sess-1", 60);
  const longTok = signPortalSession("sess-1", 3600);
  const shortExp = Number(shortTok.split(".")[1]);
  const longExp = Number(longTok.split(".")[1]);
  assert.ok(longExp > shortExp);
  // Both are presently valid (sanity: ttl is honored, not ignored).
  assert.equal(verifyPortalSession(shortTok), "sess-1");
  assert.equal(verifyPortalSession(longTok), "sess-1");
});

test("signPortalSession: distinct sessionIds yield distinct tokens & signatures", () => {
  const a = signPortalSession("sess-A", 600);
  const b = signPortalSession("sess-B", 600);
  assert.notEqual(a, b);
  // The sig is bound to the sessionId, so the signatures differ too — a token
  // for one session can never be replayed as another (see the tampered-id test).
  assert.notEqual(a.split(".")[2], b.split(".")[2]);
  assert.equal(verifyPortalSession(a), "sess-A");
  assert.equal(verifyPortalSession(b), "sess-B");
});

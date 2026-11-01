import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_HOURS,
  invitationExpiry,
  isInvitationUsable,
  isWellFormedInvitationToken,
  isWithinInvitationResendDedupe,
  setPasswordUrl,
} from "./invitation-token";

test("token je náhodný, URL-safe a dost dlouhý", () => {
  const a = generateInvitationToken();
  const b = generateInvitationToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isWellFormedInvitationToken(a), true);
  assert.equal(isWellFormedInvitationToken("neplatny"), false);
  assert.equal(isWellFormedInvitationToken("a b".repeat(20)), false);
  assert.equal(isWellFormedInvitationToken(undefined), false);
});

test("hash tokenu je deterministický a neprozrazuje token", () => {
  const token = generateInvitationToken();
  assert.equal(hashInvitationToken(token), hashInvitationToken(token));
  assert.notEqual(hashInvitationToken(token), hashInvitationToken(`${token}x`));
  assert.match(hashInvitationToken(token), /^[0-9a-f]{64}$/);
  assert.ok(!hashInvitationToken(token).includes(token));
});

test("platnost 72 hodin a použitelnost odkazu", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  const expiresAt = invitationExpiry(now);
  assert.equal(INVITATION_TTL_HOURS, 72);
  assert.equal(expiresAt.getTime() - now.getTime(), 72 * 3600 * 1000);

  const valid = { expiresAt, usedAt: null, revokedAt: null };
  assert.equal(isInvitationUsable(valid, now), true);
  assert.equal(isInvitationUsable({ ...valid, usedAt: now }, now), false);
  assert.equal(isInvitationUsable({ ...valid, revokedAt: now }, now), false);
  assert.equal(isInvitationUsable(valid, new Date(expiresAt.getTime() + 1)), false);
  assert.equal(isInvitationUsable(null, now), false);
});

test("opakované odeslání do 60 s se odmítne", () => {
  const now = new Date("2026-10-19T10:00:00Z");
  assert.equal(isWithinInvitationResendDedupe(new Date(now.getTime() - 10_000), now), true);
  assert.equal(isWithinInvitationResendDedupe(new Date(now.getTime() - 61_000), now), false);
  assert.equal(isWithinInvitationResendDedupe(null, now), false);
});

test("odkaz na nastavení hesla míří na /set-password", () => {
  assert.match(setPasswordUrl("abc_DEF-1"), /\/set-password\?token=abc_DEF-1$/);
});

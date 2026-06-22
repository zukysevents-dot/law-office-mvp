import assert from "node:assert/strict";

import {
  formatCode,
  generateCode,
  hashCode,
  normalizeCode,
} from "../src/lib/join-code";

// ponytail: one runnable check on the security path. Run: npx tsx scripts/check-join-code.ts

// Normalization makes formatting/case irrelevant to the stored hash.
assert.equal(normalizeCode("abcd efgh-jklm"), "ABCDEFGHJKLM");
assert.equal(hashCode("abcd efgh jklm"), hashCode("ABCD-EFGH-JKLM"));

// Formatting is purely cosmetic and reversible by normalize.
assert.equal(normalizeCode(formatCode("ABCDEFGHJKLM")), "ABCDEFGHJKLM");

// Generated codes are unique (entropy) and display-formatted.
const a = generateCode();
const b = generateCode();
assert.notEqual(a, b);
assert.match(a, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

// Hash is deterministic and 64 hex chars (SHA-256).
assert.equal(hashCode(a), hashCode(a));
assert.match(hashCode(a), /^[0-9a-f]{64}$/);

// A wrong code does not collide.
assert.notEqual(hashCode("AAAA-BBBB-CCCC"), hashCode("AAAA-BBBB-CCCD"));

console.log("join-code self-check passed");

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emailVerificationUrl,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from "./email-verification";

test("e-mail verification tokens are high-entropy, distinct and stored hashed", () => {
  const first = generateEmailVerificationToken();
  const second = generateEmailVerificationToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hashEmailVerificationToken(first), first);
  assert.equal(
    hashEmailVerificationToken(first),
    hashEmailVerificationToken(first),
  );
});

test("verification URL uses the configured public base and escapes the token", () => {
  const original = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://app.example.test/";
  try {
    assert.equal(
      emailVerificationUrl("abc/def"),
      "https://app.example.test/verify-email?token=abc%2Fdef",
    );
  } finally {
    if (original === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = original;
  }
});

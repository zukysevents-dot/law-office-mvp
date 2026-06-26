import assert from "node:assert/strict";
import { test } from "node:test";

// A deterministic 32-byte base64 key for tests. Set before importing crypto;
// getKey() reads the env at call time so this is enough.
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "./crypto";

test("encrypt/decrypt round-trips, including UTF-8 and empty string", () => {
  for (const value of ["heslo123", "Žluťoučký kůň 🐎", ""]) {
    assert.equal(decryptSecret(encryptSecret(value)), value);
  }
});

test("encrypting the same value twice yields different blobs (unique IV)", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("blob has the expected scheme prefix and 5 segments", () => {
  const parts = encryptSecret("x").split("$");
  assert.equal(parts.length, 5);
  assert.equal(parts[0], "v1.gcm");
});

test("tampering with the ciphertext makes decrypt throw (auth tag)", () => {
  const blob = encryptSecret("secret");
  const parts = blob.split("$");
  // Flip a byte in the ciphertext segment.
  const data = Buffer.from(parts[4], "base64");
  data[0] = data[0] ^ 0xff;
  parts[4] = data.toString("base64");
  assert.throws(() => decryptSecret(parts.join("$")));
});

test("a malformed blob is rejected", () => {
  assert.throws(() => decryptSecret("not-a-valid-blob"));
});

test("missing key fails closed (throws, never returns plaintext)", () => {
  const saved = process.env.DATA_ENCRYPTION_KEY;
  delete process.env.DATA_ENCRYPTION_KEY;
  try {
    assert.equal(isEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("secret"));
  } finally {
    process.env.DATA_ENCRYPTION_KEY = saved;
  }
});

test("a wrong-length key is rejected", () => {
  const saved = process.env.DATA_ENCRYPTION_KEY;
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
  try {
    assert.equal(isEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("secret"));
  } finally {
    process.env.DATA_ENCRYPTION_KEY = saved;
  }
});

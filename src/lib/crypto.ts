import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// At-rest encryption for sensitive secrets (e.g. data-box credentials, F2).
// AES-256-GCM gives confidentiality AND integrity (the auth tag detects
// tampering). Convention mirrors password.ts: node:crypto only, a self-
// describing "scheme$...$..." blob.
//
// FAIL-CLOSED: with no / invalid DATA_ENCRYPTION_KEY we throw rather than store
// a weak or plaintext secret. Set DATA_ENCRYPTION_KEY to 32 bytes, base64
// encoded — e.g. `openssl rand -base64 32`. The leading scheme + key-version
// segments let us rotate the key later (decrypt with the old, re-encrypt new)
// without a column migration.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce length (96 bits)
const KEY_LENGTH = 32; // AES-256
const SCHEME = "v1.gcm";
const KEY_VERSION = "1";

function getKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "DATA_ENCRYPTION_KEY není nastaven — citlivá data nelze bezpečně šifrovat.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      "DATA_ENCRYPTION_KEY musí být 32 bajtů v base64 (např. `openssl rand -base64 32`).",
    );
  }
  return key;
}

// True when a usable key is configured. Lets callers degrade gracefully (e.g.
// hide the data-box account form with a notice) instead of throwing on render.
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

// Encrypt a UTF-8 secret. A fresh random IV per call is REQUIRED for GCM — never
// reuse an IV under the same key.
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    SCHEME,
    KEY_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join("$");
}

// Decrypt a blob produced by encryptSecret. Throws if the key is wrong or the
// ciphertext/tag was tampered with (decipher.final() verifies the auth tag).
export function decryptSecret(blob: string): string {
  const key = getKey();
  const parts = blob.split("$");
  if (parts.length !== 5 || parts[0] !== SCHEME) {
    throw new Error("Neplatný formát šifrovaného údaje.");
  }
  const [, , ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LENGTH || tag.length !== 16) {
    throw new Error("Neplatný formát šifrovaného údaje.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

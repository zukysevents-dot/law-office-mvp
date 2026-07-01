import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTokenExpired,
  parseTokenResponse,
  retryDelayMs,
  shouldRetryStatus,
} from "./graph";

// --- parseTokenResponse ------------------------------------------------------

test("parseTokenResponse: validní odpověď", () => {
  assert.deepEqual(
    parseTokenResponse({ access_token: "abc", expires_in: 3600 }),
    { accessToken: "abc", expiresInSec: 3600 },
  );
});

test("parseTokenResponse: chybějící/prázdný access_token → null", () => {
  assert.equal(parseTokenResponse({ expires_in: 3600 }), null);
  assert.equal(parseTokenResponse({ access_token: "" }), null);
  assert.equal(parseTokenResponse(null), null);
  assert.equal(parseTokenResponse("neco"), null);
});

test("parseTokenResponse: chybějící/špatné expires_in → konzervativní 60s", () => {
  assert.equal(parseTokenResponse({ access_token: "a" })?.expiresInSec, 60);
  assert.equal(
    parseTokenResponse({ access_token: "a", expires_in: "x" })?.expiresInSec,
    60,
  );
});

// --- isTokenExpired ----------------------------------------------------------

test("isTokenExpired: null expiry → vždy expirovaný", () => {
  assert.equal(isTokenExpired(null, 1000), true);
  assert.equal(isTokenExpired(undefined, 1000), true);
});

test("isTokenExpired: uvnitř skew okna → expirovaný (refresh dřív)", () => {
  const now = 1_000_000;
  // expiry za 30s, skew 60s → považován za expirovaný
  assert.equal(isTokenExpired(now + 30_000, now, 60_000), true);
});

test("isTokenExpired: dostatečně daleko → platný", () => {
  const now = 1_000_000;
  assert.equal(isTokenExpired(now + 120_000, now, 60_000), false);
});

// --- shouldRetryStatus -------------------------------------------------------

test("shouldRetryStatus: 429 a 5xx → retry, ostatní ne", () => {
  assert.equal(shouldRetryStatus(429), true);
  assert.equal(shouldRetryStatus(500), true);
  assert.equal(shouldRetryStatus(503), true);
  assert.equal(shouldRetryStatus(400), false);
  assert.equal(shouldRetryStatus(401), false);
  assert.equal(shouldRetryStatus(404), false);
  assert.equal(shouldRetryStatus(200), false);
});

// --- retryDelayMs ------------------------------------------------------------

test("retryDelayMs: respektuje Retry-After v sekundách (cap 30s)", () => {
  assert.equal(retryDelayMs(0, "2"), 2000);
  assert.equal(retryDelayMs(0, "100"), 30_000);
});

test("retryDelayMs: bez Retry-After → exponenciální backoff (cap 30s)", () => {
  assert.equal(retryDelayMs(0, null), 500);
  assert.equal(retryDelayMs(1, null), 1000);
  assert.equal(retryDelayMs(2, null), 2000);
  assert.equal(retryDelayMs(10, null), 30_000);
});

test("retryDelayMs: neplatný/záporný Retry-After → fallback backoff", () => {
  assert.equal(retryDelayMs(0, "abc"), 500);
  assert.equal(retryDelayMs(1, "-5"), 1000);
});

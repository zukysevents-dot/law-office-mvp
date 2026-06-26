import assert from "node:assert/strict";
import { test } from "node:test";

import { parseClientIp, UNKNOWN_IP } from "./portal-rate-limit";

test("parseClientIp: takes the first hop of the x-forwarded-for chain", () => {
  // "client, proxy1, proxy2" — the original client is the first entry.
  assert.equal(
    parseClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178", null),
    "203.0.113.7",
  );
});

test("parseClientIp: trims whitespace around the client IP", () => {
  assert.equal(parseClientIp("  203.0.113.7  , 10.0.0.1", null), "203.0.113.7");
});

test("parseClientIp: falls back to x-real-ip when forwarded-for is absent", () => {
  assert.equal(parseClientIp(null, "198.51.100.9"), "198.51.100.9");
});

test("parseClientIp: blank/whitespace forwarded-for falls through to x-real-ip", () => {
  assert.equal(parseClientIp("", "198.51.100.9"), "198.51.100.9");
  assert.equal(parseClientIp("   ", "198.51.100.9"), "198.51.100.9");
  assert.equal(parseClientIp("  ,  ", "198.51.100.9"), "198.51.100.9");
});

test("parseClientIp: buckets requests with no proxy headers under UNKNOWN_IP", () => {
  assert.equal(parseClientIp(null, null), UNKNOWN_IP);
  assert.equal(parseClientIp("", ""), UNKNOWN_IP);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideAndRecordThrottleAttempt,
  hashLoginIdentifier,
  isWithinLoginRateLimit,
  LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT,
  LOGIN_RATE_LIMIT_MAX_PER_IP,
  normalizeLoginIdentifier,
  orderedThrottleLockKeys,
  shouldCleanupAuthLedgers,
} from "./login-rate-limit";

test("login identifiers are normalized and stored as a stable one-way bucket", () => {
  assert.equal(normalizeLoginIdentifier(" User@Example.COM "), "user@example.com");
  assert.equal(
    hashLoginIdentifier(" User@Example.COM "),
    hashLoginIdentifier("user@example.com"),
  );
  assert.notEqual(hashLoginIdentifier("user@example.com"), "user@example.com");
});

test("login limiter blocks at either the account or shared-IP boundary", () => {
  assert.equal(isWithinLoginRateLimit(0, 0), true);
  assert.equal(
    isWithinLoginRateLimit(0, LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT),
    false,
  );
  assert.equal(
    isWithinLoginRateLimit(LOGIN_RATE_LIMIT_MAX_PER_IP, 0),
    false,
  );
  assert.equal(
    isWithinLoginRateLimit(
      LOGIN_RATE_LIMIT_MAX_PER_IP - 1,
      LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT - 1,
    ),
    true,
  );
});

test("throttle transaction body records blocked attempts after reading both buckets", async () => {
  const calls: string[] = [];
  const result = await decideAndRecordThrottleAttempt(
    {
      countForIp: async () => {
        calls.push("count-ip");
        return 30;
      },
      countForIdentifier: async () => {
        calls.push("count-account");
        return 1;
      },
      createAttempt: async () => {
        calls.push("create");
        return "attempt-1";
      },
    },
    30,
    5,
  );

  assert.deepEqual(result, { allowed: false, attemptId: "attempt-1" });
  assert.equal(calls.at(-1), "create");
  assert.deepEqual(new Set(calls.slice(0, 2)), new Set(["count-ip", "count-account"]));
});

test("advisory lock order is deterministic and cleanup is probabilistic", () => {
  const keys = orderedThrottleLockKeys("login", "203.0.113.2", "hash");
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(shouldCleanupAuthLedgers(0), true);
  assert.equal(shouldCleanupAuthLedgers(0.5), false);
});

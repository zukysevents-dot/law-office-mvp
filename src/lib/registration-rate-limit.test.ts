import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isWithinRegistrationRateLimit,
  REGISTRATION_RATE_LIMIT_MAX_PER_ADDRESS,
  REGISTRATION_RATE_LIMIT_MAX_PER_IP,
} from "./registration-rate-limit";

test("registration limiter applies both address and shared-IP quotas", () => {
  assert.equal(isWithinRegistrationRateLimit(0, 0), true);
  assert.equal(
    isWithinRegistrationRateLimit(
      0,
      REGISTRATION_RATE_LIMIT_MAX_PER_ADDRESS,
    ),
    false,
  );
  assert.equal(
    isWithinRegistrationRateLimit(REGISTRATION_RATE_LIMIT_MAX_PER_IP, 0),
    false,
  );
});

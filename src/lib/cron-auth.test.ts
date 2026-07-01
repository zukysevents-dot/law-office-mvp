import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { authorizeCronRequest } from "./cron-auth";

const ORIGINAL = {
  CRON_SECRET: process.env.CRON_SECRET,
  NOTIFICATION_RUN_SECRET: process.env.NOTIFICATION_RUN_SECRET,
};

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL.CRON_SECRET;
  process.env.NOTIFICATION_RUN_SECRET = ORIGINAL.NOTIFICATION_RUN_SECRET;
});

test("authorizeCronRequest: neither secret set → not_configured", () => {
  delete process.env.CRON_SECRET;
  delete process.env.NOTIFICATION_RUN_SECRET;
  assert.equal(authorizeCronRequest("Bearer whatever"), "not_configured");
});

test("authorizeCronRequest: placeholder se ignoruje (fail closed)", () => {
  process.env.CRON_SECRET = "change-me-locally";
  delete process.env.NOTIFICATION_RUN_SECRET;
  assert.equal(authorizeCronRequest("Bearer change-me-locally"), "not_configured");
});

test("authorizeCronRequest: shoda CRON_SECRET → ok", () => {
  process.env.CRON_SECRET = "vercel-cron-token";
  delete process.env.NOTIFICATION_RUN_SECRET;
  assert.equal(authorizeCronRequest("Bearer vercel-cron-token"), "ok");
});

test("authorizeCronRequest: shoda NOTIFICATION_RUN_SECRET → ok (manuální caller)", () => {
  delete process.env.CRON_SECRET;
  process.env.NOTIFICATION_RUN_SECRET = "manual-token";
  assert.equal(authorizeCronRequest("Bearer manual-token"), "ok");
});

test("authorizeCronRequest: přijme kterýkoli z obou nastavených tokenů", () => {
  process.env.CRON_SECRET = "cron-token";
  process.env.NOTIFICATION_RUN_SECRET = "run-token";
  assert.equal(authorizeCronRequest("Bearer cron-token"), "ok");
  assert.equal(authorizeCronRequest("Bearer run-token"), "ok");
});

test("authorizeCronRequest: neshoda → unauthorized", () => {
  process.env.CRON_SECRET = "cron-token";
  delete process.env.NOTIFICATION_RUN_SECRET;
  assert.equal(authorizeCronRequest("Bearer wrong"), "unauthorized");
  assert.equal(authorizeCronRequest(""), "unauthorized");
});

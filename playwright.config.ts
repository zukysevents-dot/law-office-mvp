import { defineConfig, devices } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_PORT,
  E2E_SERVER_ENV,
  storageStatePath,
} from "./tests/e2e/support/e2e-env";

// Firefox / WebKit are opt-in: Chromium is the required fast local run, the
// other two need `npx playwright install` and are meant for CI.
const allBrowsers = process.env.E2E_ALL_BROWSERS === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.output",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A single Next server backs the whole suite; more than two workers makes it
  // the bottleneck and turns server-action round-trips into flaky timeouts.
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "tests/e2e/.report", open: "never" }],
  ],
  use: {
    baseURL: E2E_BASE_URL,
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "auth",
      testMatch: /support\/auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: storageStatePath("admin"),
      },
      dependencies: ["auth"],
      testIgnore: /support\//,
    },
    ...(allBrowsers
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              viewport: { width: 1440, height: 900 },
              storageState: storageStatePath("admin"),
            },
            dependencies: ["auth"],
            testIgnore: /support\//,
          },
          {
            name: "webkit",
            use: {
              ...devices["Desktop Safari"],
              viewport: { width: 1440, height: 900 },
              storageState: storageStatePath("admin"),
            },
            dependencies: ["auth"],
            testIgnore: /support\//,
          },
        ]
      : []),
  ],
  webServer: {
    // Production build: it exercises the real error boundaries (a dev overlay
    // would mask them) and keeps a 40+ test suite fast. NEXT_DIST_DIR points the
    // build at .next-e2e so a running `npm run dev` cache is never clobbered.
    command: `npm run build && npx next start -H 127.0.0.1 -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: E2E_SERVER_ENV,
  },
});

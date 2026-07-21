import { defineConfig, devices } from "@playwright/test";

// Opt-in E2E config. Not referenced by package.json scripts on purpose.
export default defineConfig({
  testDir: ".",
  outputDir: ".output",
  timeout: 30_000,
  fullyParallel: false, // shared DB state; keep specs sequential
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

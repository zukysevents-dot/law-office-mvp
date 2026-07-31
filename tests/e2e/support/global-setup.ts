import { execFileSync } from "node:child_process";

// The real work lives in prepare-e2e-db.ts and runs through tsx: the generated
// Prisma client is ESM, which Playwright's CJS config loader cannot import.
export default function globalSetup() {
  execFileSync("npx", ["tsx", "tests/e2e/support/prepare-e2e-db.ts"], {
    stdio: "inherit",
  });
}

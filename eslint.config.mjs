import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Build output of the E2E suite (NEXT_DIST_DIR in playwright.config.ts).
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // design-sync tooling & build artifacts (gitignored, not app source):
    "ds-bundle/**",
    ".ds-sync/**",
    ".design-sync/**",
    "dist/**",
  ]),
]);

export default eslintConfig;

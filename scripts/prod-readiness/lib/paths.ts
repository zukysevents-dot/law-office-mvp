import path from "node:path";

// All gates run from the repo root (the npm scripts invoke them from there).
export const REPO_ROOT = process.cwd();

export const REPORTS_DIR = path.join(REPO_ROOT, "reports", "prod-readiness");
export const JUNIT_DIR = path.join(REPORTS_DIR, "junit");
export const REPORT_MD = path.join(REPORTS_DIR, "report.md");

// Part B lives in-repo (committed) — its presence is part of the "build green"
// contract enforced by run-all.ts.
export const RISK_REGISTER = path.join(
  REPO_ROOT,
  "docs",
  "prod-readiness",
  "RISK-REGISTER.md",
);

// Directories the static guards scan (production code only). The pipeline's own
// tooling under scripts/ is intentionally excluded so e.g. the injection guard
// does not flag the child_process this very harness uses.
export const SOURCE_ROOTS = ["src", "prisma"];

// Never walk into these.
export const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "ds-bundle",
  ".ds-sync",
  ".design-sync",
  "coverage",
  "reports",
]);

// Generated Prisma client is machine output, not authored source.
export const IGNORED_PATH_FRAGMENTS = ["src/generated/", "src\\generated\\"];

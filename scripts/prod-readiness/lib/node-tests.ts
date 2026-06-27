import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { JUNIT_DIR, REPO_ROOT } from "./paths";

export interface NodeTestResult {
  ok: boolean;
  junitPath: string;
  tests: number;
  failures: number;
  output: string;
}

// Runs the given test files through the native node:test runner with tsx, emits
// a JUnit XML alongside the human-readable spec output, and reports pass/fail.
// Used by A1/A2 to execute the negative test subsets. ok===true means every
// negative test asserted denial correctly (build stays green).
export function runNodeTests(files: string[], label: string): NodeTestResult {
  fs.mkdirSync(JUNIT_DIR, { recursive: true });
  const junitPath = path.join(JUNIT_DIR, `${label}.xml`);

  const res = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=junit",
      `--test-reporter-destination=${junitPath}`,
      ...files,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;

  let tests = 0;
  let failures = 0;
  try {
    // node:test's JUnit reporter emits a flat list of <testcase> elements with
    // no aggregate tests=/failures= attributes, so count the elements directly.
    const xml = fs.readFileSync(junitPath, "utf8");
    tests = (xml.match(/<testcase\b/g) ?? []).length;
    failures =
      (xml.match(/<failure\b/g) ?? []).length + (xml.match(/<error\b/g) ?? []).length;
  } catch {
    // No XML produced (runner failed to start) — treat as failure below.
  }

  return {
    ok: res.status === 0,
    junitPath,
    tests,
    failures,
    output,
  };
}

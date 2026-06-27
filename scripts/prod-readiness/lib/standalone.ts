import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { applyAllowlist } from "./allowlist";
import { Finding, GateResult, gateIsRed, sortFindings } from "./findings";
import { writeGateJunit } from "./junit";
import { printGateConsole } from "./report";

// True when THIS module file is the process entrypoint (i.e. `node ... gates/a4.ts`),
// false when it was imported by the orchestrator. Lets each gate be both an
// importable function and a standalone `npm run gate:a4` command.
export function isEntrypoint(metaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    const modulePath = fs.realpathSync(fileURLToPath(metaUrl));
    const entryPath = fs.realpathSync(argv1);
    return modulePath === entryPath;
  } catch {
    return false;
  }
}

// Moves any allowlisted findings out of `findings` into `accepted`, then sorts.
// Every gate calls this before returning so acceptance is applied consistently.
export function finalizeGate(gate: GateResult, rawFindings: Finding[]): GateResult {
  const { blocking, accepted } = applyAllowlist(gate.id, rawFindings);
  gate.findings = sortFindings(blocking);
  gate.accepted = accepted;
  return gate;
}

// When run directly, execute the gate, emit its JUnit, print a summary, and set
// the process exit code (non-zero ⇒ red ⇒ build fails). No-op when imported.
export async function runStandalone(
  metaUrl: string,
  gateFn: () => Promise<GateResult>,
): Promise<void> {
  if (!isEntrypoint(metaUrl)) {
    return;
  }
  const gate = await gateFn();
  writeGateJunit(gate);
  printGateConsole(gate);
  process.exitCode = gateIsRed(gate) ? 1 : 0;
}

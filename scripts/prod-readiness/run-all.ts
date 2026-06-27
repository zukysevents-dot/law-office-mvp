import fs from "node:fs";

import { GateResult, gateIsRed } from "./lib/findings";
import { writeAggregateJunit, writeGateJunit } from "./lib/junit";
import { RISK_REGISTER } from "./lib/paths";
import { printGateConsole, relReport, writeReport } from "./lib/report";
import { gateA1 } from "./gates/a1-tenant-isolation";
import { gateA2 } from "./gates/a2-rbac";
import { gateA3 } from "./gates/a3-secrets";
import { gateA4 } from "./gates/a4-deps";
import { gateA5 } from "./gates/a5-sast";
import { gateA6 } from "./gates/a6-perf";
import { gateA7 } from "./gates/a7-static-guard";

const RUNNERS: Array<[string, () => Promise<GateResult>]> = [
  ["A1", gateA1],
  ["A2", gateA2],
  ["A3", gateA3],
  ["A4", gateA4],
  ["A5", gateA5],
  ["A6", gateA6],
  ["A7", gateA7],
];

async function main(): Promise<void> {  console.log("== Prod-readiness pipeline — ČÁST A (automatizované gaty) ==\n");

  const gates: GateResult[] = [];
  for (const [, fn] of RUNNERS) {
    const gate = await fn();
    writeGateJunit(gate);
    printGateConsole(gate);
    gates.push(gate);
  }

  writeAggregateJunit(gates);

  // The "build green" contract includes ČÁST B existing — a missing/empty risk
  // register can never be a green build, even if every gate passes.
  const riskRegisterPresent =
    fs.existsSync(RISK_REGISTER) && fs.statSync(RISK_REGISTER).size > 400;

  const reportPath = writeReport(gates, {
    riskRegisterPresent,
    generatedAtIso: new Date().toISOString(),
  });

  const anyRed = gates.some(gateIsRed);
  const buildGreen = !anyRed && riskRegisterPresent;

  console.log("\n== Souhrn ČÁSTI A ==");
  for (const gate of gates) {
    const status = gateIsRed(gate) ? "RED " : gate.skips.length > 0 ? "GREEN*" : "GREEN";
    console.log(
      `  ${status}  ${gate.id} ${gate.title} — ` +
        `${gate.findings.length} blokujících, ${gate.skips.length} skipped`,
    );
  }

  console.log("");
  if (!riskRegisterPresent) {
    console.log(
      "✗ CHYBÍ risk register B (docs/prod-readiness/RISK-REGISTER.md). " +
        "Bez něj build NEMŮŽE být zelený.",
    );
  }
  console.log(`Report:       ${reportPath}`);
  console.log(`Report (rel): ${relReport()}`);
  console.log(
    buildGreen
      ? "\n✓ BUILD ZELENÝ — všechny gaty A bez blokujícího nálezu a risk register B existuje."
      : "\n✗ BUILD ČERVENÝ — viz nálezy výše (díry NEopravujeme tiše; risk register B je k lidskému rozhodnutí).",
  );
  console.log("  (Zelená ČÁSTI A neznamená, že rizika v ČÁSTI B jsou vyřešená. SKIP ≠ pass.)");

  process.exitCode = buildGreen ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

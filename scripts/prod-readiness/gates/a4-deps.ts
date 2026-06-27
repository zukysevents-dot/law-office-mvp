import { spawnSync } from "node:child_process";

import { emptyGate, Finding, GateResult, Severity } from "../lib/findings";
import { REPO_ROOT } from "../lib/paths";
import { finalizeGate, runStandalone } from "../lib/standalone";

interface AuditVuln {
  name?: string;
  severity?: string;
  range?: string;
  via?: Array<string | { title?: string; url?: string; severity?: string }>;
}

interface AuditReport {
  vulnerabilities?: Record<string, AuditVuln>;
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
}

// A4 — Závislosti. `npm audit --json` jako gate. Padá na high/critical. Když
// audit nelze spustit (offline / bez přístupu k registru), čestně SKIPne, ne
// falešnou zelenou.
export async function gateA4(): Promise<GateResult> {
  const gate = emptyGate("A4", "Závislosti (npm audit)");
  const raw: Finding[] = [];

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(npmCmd, ["audit", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  });

  const stdout = res.stdout ?? "";
  let report: AuditReport | null = null;
  try {
    report = JSON.parse(stdout) as AuditReport;
  } catch {
    report = null;
  }

  if (!report || !report.metadata?.vulnerabilities) {
    gate.skips.push({
      rule: "deps/npm-audit",
      reason:
        "`npm audit --json` nevrátil validní report (offline / bez přístupu k registru?). " +
        "Gate přeskočen — SKIP ≠ zelená. V CI běží s konektivitou.",
    });
    return finalizeGate(gate, raw);
  }

  const counts = report.metadata.vulnerabilities;
  gate.notes.push(
    `npm audit: critical=${counts.critical ?? 0}, high=${counts.high ?? 0}, ` +
      `moderate=${counts.moderate ?? 0}, low=${counts.low ?? 0}.`,
  );

  const blockingSeverities = new Set(["critical", "high"]);
  const vulns = report.vulnerabilities ?? {};
  for (const [pkg, vuln] of Object.entries(vulns)) {
    const severity = (vuln.severity ?? "").toLowerCase();
    if (!blockingSeverities.has(severity)) {
      continue;
    }
    const advisory = (vuln.via ?? [])
      .map((v) => (typeof v === "string" ? v : v.title ?? v.url ?? ""))
      .filter(Boolean)
      .slice(0, 2)
      .join("; ");
    raw.push({
      rule: "deps/vulnerable-dependency",
      severity: severity === "critical" ? ("CRITICAL" as Severity) : ("HIGH" as Severity),
      message:
        `Zranitelná závislost \`${pkg}\` (${severity}${vuln.range ? `, ${vuln.range}` : ""})` +
        (advisory ? ` — ${advisory}` : ""),
      evidence: `npm audit: ${pkg} = ${severity}`,
    });
  }

  // If counts report high/critical but the per-package map didn't enumerate them
  // (older npm shapes), still fail with a summary finding.
  const totalBlocking = (counts.critical ?? 0) + (counts.high ?? 0);
  if (totalBlocking > 0 && raw.length === 0) {
    raw.push({
      rule: "deps/vulnerable-dependency",
      severity: (counts.critical ?? 0) > 0 ? "CRITICAL" : "HIGH",
      message: `npm audit hlásí ${totalBlocking} high/critical zranitelností (viz \`npm audit\`).`,
    });
  }

  if (raw.length === 0) {
    gate.passes = 1;
    gate.notes.push("Žádné high/critical zranitelnosti.");
  }

  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA4);

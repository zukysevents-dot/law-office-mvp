// Shared result vocabulary for every gate. A gate is GREEN only when it has no
// blocking findings; SKIP is never a pass.

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  evidence?: string;
}

export interface Skip {
  rule: string;
  reason: string;
}

export interface GateResult {
  id: string; // "A1"
  title: string;
  // Blocking findings. Any non-empty list ⇒ gate red ⇒ build red.
  findings: Finding[];
  // Honestly-reported gaps (no DB, no external tool). Reported as <skipped/>,
  // NEVER counted as a pass.
  skips: Skip[];
  // Findings the team has consciously accepted via the allowlist. Listed in the
  // report for transparency, but they do NOT fail the build. Acceptance is a
  // human sign-off in allowlist.ts, never a silent code change.
  accepted: Finding[];
  // Number of checks that passed (drives the JUnit pass count).
  passes: number;
  // Free-text notes shown in the report (e.g. "N/A: no MCP server").
  notes: string[];
  // Paths to externally-produced JUnit XML (e.g. node:test) to fold into the
  // aggregate report alongside this gate's own XML.
  externalJunit: string[];
}

export function emptyGate(id: string, title: string): GateResult {
  return {
    id,
    title,
    findings: [],
    skips: [],
    accepted: [],
    passes: 0,
    notes: [],
    externalJunit: [],
  };
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

export function gateIsRed(gate: GateResult): boolean {
  return gate.findings.length > 0;
}

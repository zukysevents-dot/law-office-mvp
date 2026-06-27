import { Finding } from "./findings";

// Conscious, human-signed acceptance of a guard finding. This is the ONLY way a
// real finding turns from red → not-blocking, and it is deliberately explicit:
// a reviewer adds an entry here with a reason. It is never a silent change to
// production code to make a gate go green.
//
// An entry matches a finding when the gate id + rule match and (if given) the
// file matches and the line is within ±lineFuzz of the finding's line.
export interface AllowEntry {
  gate: string; // "A6"
  rule: string; // matches Finding.rule
  file?: string; // repo-relative, forward-slashed
  line?: number;
  reason: string;
  // Who accepted it and when — for the audit trail in the report.
  acceptedBy: string;
}

const LINE_FUZZ = 3;

// Seeded empty. After the first real run, genuine false positives (NOT real
// holes) get an entry here with a justification. The list is printed in every
// report so acceptances stay visible.
export const ALLOWLIST: AllowEntry[] = [];

export function findAllow(
  gate: string,
  finding: Finding,
): AllowEntry | undefined {
  return ALLOWLIST.find((entry) => {
    if (entry.gate !== gate || entry.rule !== finding.rule) {
      return false;
    }
    if (entry.file && entry.file !== finding.file) {
      return false;
    }
    if (
      entry.line != null &&
      finding.line != null &&
      Math.abs(entry.line - finding.line) > LINE_FUZZ
    ) {
      return false;
    }
    return true;
  });
}

// Splits raw findings into still-blocking vs. accepted (allowlisted).
export function applyAllowlist(
  gate: string,
  findings: Finding[],
): { blocking: Finding[]; accepted: Finding[] } {
  const blocking: Finding[] = [];
  const accepted: Finding[] = [];
  for (const finding of findings) {
    if (findAllow(gate, finding)) {
      accepted.push(finding);
    } else {
      blocking.push(finding);
    }
  }
  return { blocking, accepted };
}

import fs from "node:fs";
import path from "node:path";

import { GateResult } from "./findings";
import { JUNIT_DIR } from "./paths";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Renders one gate as a <testsuite>. Each blocking finding is a failing
// <testcase>; each skip is a <skipped/> testcase; accepted (allowlisted)
// findings are passing testcases tagged so they remain visible. A single
// summary testcase records the count of internal checks that passed.
export function gateToTestsuiteXml(gate: GateResult): string {
  const lines: string[] = [];
  const failures = gate.findings.length;
  const skipped = gate.skips.length;
  const tests =
    gate.findings.length +
    gate.skips.length +
    gate.accepted.length +
    (gate.passes > 0 ? 1 : 0);

  lines.push(
    `  <testsuite name="${escapeXml(`${gate.id} ${gate.title}`)}" ` +
      `tests="${tests}" failures="${failures}" skipped="${skipped}">`,
  );

  for (const finding of gate.findings) {
    const where = finding.file
      ? `${finding.file}${finding.line ? `:${finding.line}` : ""}`
      : gate.id;
    const name = `[${finding.severity}] ${finding.rule} — ${where}`;
    lines.push(
      `    <testcase name="${escapeXml(name)}" classname="${escapeXml(gate.id)}">`,
    );
    const detail = [finding.message, finding.evidence ? `\n${finding.evidence}` : ""].join(
      "",
    );
    lines.push(
      `      <failure message="${escapeXml(finding.message)}" type="${escapeXml(
        finding.severity,
      )}">${escapeXml(detail)}</failure>`,
    );
    lines.push("    </testcase>");
  }

  for (const skip of gate.skips) {
    lines.push(
      `    <testcase name="${escapeXml(`SKIP ${skip.rule}`)}" classname="${escapeXml(
        gate.id,
      )}">`,
    );
    lines.push(`      <skipped message="${escapeXml(skip.reason)}"/>`);
    lines.push("    </testcase>");
  }

  for (const accepted of gate.accepted) {
    const where = accepted.file
      ? `${accepted.file}${accepted.line ? `:${accepted.line}` : ""}`
      : gate.id;
    lines.push(
      `    <testcase name="${escapeXml(
        `ACCEPTED ${accepted.rule} — ${where}`,
      )}" classname="${escapeXml(gate.id)}"/>`,
    );
  }

  if (gate.passes > 0) {
    lines.push(
      `    <testcase name="${escapeXml(
        `${gate.id} checks passed (${gate.passes})`,
      )}" classname="${escapeXml(gate.id)}"/>`,
    );
  }

  lines.push("  </testsuite>");
  return lines.join("\n");
}

export function writeGateJunit(gate: GateResult): string {
  fs.mkdirSync(JUNIT_DIR, { recursive: true });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="prod-readiness ${gate.id}">`,
    gateToTestsuiteXml(gate),
    "</testsuites>",
    "",
  ].join("\n");
  const dest = path.join(JUNIT_DIR, `${gate.id.toLowerCase()}.xml`);
  fs.writeFileSync(dest, xml, "utf8");
  return dest;
}

export function writeAggregateJunit(gates: GateResult[]): string {
  fs.mkdirSync(JUNIT_DIR, { recursive: true });
  const body = gates.map(gateToTestsuiteXml).join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites name="prod-readiness">',
    body,
    "</testsuites>",
    "",
  ].join("\n");
  const dest = path.join(JUNIT_DIR, "prod-readiness.xml");
  fs.writeFileSync(dest, xml, "utf8");
  return dest;
}

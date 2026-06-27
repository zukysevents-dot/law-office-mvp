import fs from "node:fs";
import path from "node:path";

import { Finding, GateResult, gateIsRed, sortFindings } from "./findings";
import { ALLOWLIST } from "./allowlist";
import { REPORT_MD, REPORTS_DIR } from "./paths";

const SEVERITY_BADGE: Record<Finding["severity"], string> = {
  CRITICAL: "🟥 CRITICAL",
  HIGH: "🟧 HIGH",
  MEDIUM: "🟨 MEDIUM",
  LOW: "⬜ LOW",
};

export function gateStatus(gate: GateResult): "RED" | "GREEN" | "GREEN (skips)" {
  if (gateIsRed(gate)) {
    return "RED";
  }
  return gate.skips.length > 0 ? "GREEN (skips)" : "GREEN";
}

export function printGateConsole(gate: GateResult): void {
  const status = gateStatus(gate);
  const mark = status === "RED" ? "✗" : "✓";
  console.log(
    `${mark} ${gate.id} ${gate.title} — ${status} ` +
      `(${gate.findings.length} blocking, ${gate.accepted.length} accepted, ` +
      `${gate.skips.length} skipped, ${gate.passes} passed)`,
  );
  for (const finding of sortFindings(gate.findings)) {
    const where = finding.file
      ? ` [${finding.file}${finding.line ? `:${finding.line}` : ""}]`
      : "";
    console.log(`    ${SEVERITY_BADGE[finding.severity]} ${finding.rule}: ${finding.message}${where}`);
  }
  for (const skip of gate.skips) {
    console.log(`    ⏭  SKIP ${skip.rule}: ${skip.reason}`);
  }
  for (const note of gate.notes) {
    console.log(`    ℹ  ${note}`);
  }
}

function findingRow(gate: GateResult, finding: Finding): string {
  const where = finding.file
    ? `\`${finding.file}${finding.line ? `:${finding.line}` : ""}\``
    : "—";
  return `| ${gate.id} | ${SEVERITY_BADGE[finding.severity]} | ${finding.rule} | ${finding.message} | ${where} |`;
}

export interface ReportContext {
  riskRegisterPresent: boolean;
  generatedAtIso?: string;
}

export function renderReportMd(
  gates: GateResult[],
  ctx: ReportContext,
): string {
  const anyRed = gates.some(gateIsRed);
  const lines: string[] = [];

  lines.push("# Prod-readiness report — ČÁST A (automatizované gaty)");
  lines.push("");
  if (ctx.generatedAtIso) {
    lines.push(`_Vygenerováno: ${ctx.generatedAtIso}_`);
    lines.push("");
  }

  // --- Verdict -------------------------------------------------------------
  const buildGreen = !anyRed && ctx.riskRegisterPresent;
  lines.push("## Verdikt");
  lines.push("");
  lines.push(
    buildGreen
      ? "**BUILD ZELENÝ** — všechny gaty A bez blokujícího nálezu a risk register B existuje."
      : "**BUILD ČERVENÝ** — viz důvody níže.",
  );
  if (anyRed) {
    lines.push("");
    lines.push("- Alespoň jeden gate má blokující nález (díra nalezena — dle zadání se NEopravuje tiše).");
  }
  if (!ctx.riskRegisterPresent) {
    lines.push("");
    lines.push("- **Chybí risk register B** (`docs/prod-readiness/RISK-REGISTER.md`). Bez něj build nemůže být zelený.");
  }
  lines.push("");
  lines.push(
    "> Zelená ČÁSTI A **neznamená**, že rizika v ČÁSTI B jsou vyřešená. SKIP není pass.",
  );
  lines.push("");

  // --- Summary table -------------------------------------------------------
  lines.push("## Souhrn gatů");
  lines.push("");
  lines.push("| Gate | Stav | Blokující | Přijaté (allowlist) | Skipped | Prošlo |");
  lines.push("|------|------|-----------|---------------------|---------|--------|");
  for (const gate of gates) {
    lines.push(
      `| ${gate.id} ${gate.title} | ${gateStatus(gate)} | ${gate.findings.length} | ` +
        `${gate.accepted.length} | ${gate.skips.length} | ${gate.passes} |`,
    );
  }
  lines.push("");

  // --- All findings, ranked by risk ---------------------------------------
  // Dedupe across gates by (rule|file|line) so A7's union backstop, which
  // intentionally re-runs the same static guards as A1/A2/A3/A5/A6, doesn't
  // double-list the same hole. The first gate that surfaced it wins.
  const seen = new Set<string>();
  const allFindings: Array<{ gate: GateResult; finding: Finding }> = [];
  for (const gate of gates) {
    for (const finding of sortFindings(gate.findings)) {
      const key = `${finding.rule}|${finding.file ?? ""}|${finding.line ?? ""}|${finding.message}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      allFindings.push({ gate, finding });
    }
  }
  lines.push("## Nálezy seřazené dle rizika");
  lines.push("");
  if (allFindings.length === 0) {
    lines.push("_Žádné blokující nálezy._");
  } else {
    lines.push("| Gate | Závažnost | Pravidlo | Popis | Místo |");
    lines.push("|------|-----------|----------|-------|-------|");
    const ranked = [...allFindings].sort(
      (a, b) =>
        // CRITICAL(0) first
        ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(a.finding.severity) -
        ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(b.finding.severity),
    );
    for (const { gate, finding } of ranked) {
      lines.push(findingRow(gate, finding));
    }
  }
  lines.push("");

  // --- Skips (explicit, never a pass) -------------------------------------
  const allSkips = gates.flatMap((gate) =>
    gate.skips.map((skip) => ({ gate, skip })),
  );
  lines.push("## SKIPPED (neověřeno — NE zelená)");
  lines.push("");
  if (allSkips.length === 0) {
    lines.push("_Nic nebylo přeskočeno._");
  } else {
    lines.push("| Gate | Pravidlo | Důvod |");
    lines.push("|------|----------|-------|");
    for (const { gate, skip } of allSkips) {
      lines.push(`| ${gate.id} | ${skip.rule} | ${skip.reason} |`);
    }
  }
  lines.push("");

  // --- Accepted (allowlisted) ---------------------------------------------
  const allAccepted = gates.flatMap((gate) =>
    gate.accepted.map((finding) => ({ gate, finding })),
  );
  if (allAccepted.length > 0 || ALLOWLIST.length > 0) {
    lines.push("## Vědomě přijaté nálezy (allowlist — lidský podpis)");
    lines.push("");
    lines.push("| Gate | Pravidlo | Místo | Důvod | Schválil |");
    lines.push("|------|----------|-------|-------|----------|");
    for (const { gate, finding } of allAccepted) {
      const where = finding.file
        ? `\`${finding.file}${finding.line ? `:${finding.line}` : ""}\``
        : "—";
      const entry = ALLOWLIST.find(
        (a) => a.gate === gate.id && a.rule === finding.rule,
      );
      lines.push(
        `| ${gate.id} | ${finding.rule} | ${where} | ${entry?.reason ?? "—"} | ${entry?.acceptedBy ?? "—"} |`,
      );
    }
    lines.push("");
  }

  // --- Per-gate notes ------------------------------------------------------
  const notedGates = gates.filter((gate) => gate.notes.length > 0);
  if (notedGates.length > 0) {
    lines.push("## Poznámky gatů");
    lines.push("");
    for (const gate of notedGates) {
      lines.push(`### ${gate.id} ${gate.title}`);
      for (const note of gate.notes) {
        lines.push(`- ${note}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function writeReport(gates: GateResult[], ctx: ReportContext): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, renderReportMd(gates, ctx), "utf8");
  return REPORT_MD;
}

export function relReport(): string {
  return path.relative(process.cwd(), REPORT_MD).split(path.sep).join("/");
}

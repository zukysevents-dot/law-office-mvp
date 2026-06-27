import { Finding, Severity } from "../lib/findings";
import { collectSources } from "../lib/walk";
import { eachMatch } from "./util";

interface Rule {
  rule: string;
  severity: Severity;
  re: RegExp;
  message: string;
}

// SAST patterns for injection / unsafe execution in production code. Parameterized
// Prisma ($queryRaw with a tagged template) is SAFE and intentionally NOT flagged;
// only the *Unsafe variants and raw process/eval surfaces are.
const RULES: Rule[] = [
  {
    rule: "injection/raw-sql-unsafe",
    severity: "HIGH",
    re: /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(/,
    message: "Použití $queryRawUnsafe/$executeRawUnsafe — neparametrizovaný raw SQL (riziko SQL injection).",
  },
  {
    rule: "injection/child-process",
    severity: "HIGH",
    // Imports of child_process + the unambiguous sync helpers, plus bare
    // exec(/spawn( — but the negative lookbehind keeps `regex.exec(...)` /
    // `obj.spawn(...)` from matching (those are not child_process).
    re: /from\s+["'](?:node:)?child_process["']|require\(\s*["'](?:node:)?child_process["']\s*\)|\bexecSync\s*\(|\bexecFileSync\s*\(|\bspawnSync\s*\(|(?<![.\w])exec\s*\(|(?<![.\w])spawn\s*\(/,
    message: "Spouštění procesu (child_process/exec/spawn) v produkčním kódu — riziko command injection.",
  },
  {
    rule: "injection/eval",
    severity: "HIGH",
    re: /\beval\s*\(|new\s+Function\s*\(/,
    message: "Dynamické vyhodnocení kódu (eval / new Function) — riziko code injection.",
  },
  {
    rule: "injection/dangerous-html",
    severity: "MEDIUM",
    re: /dangerouslySetInnerHTML/,
    message: "dangerouslySetInnerHTML — riziko XSS, pokud obsah není sanitizován.",
  },
];

export interface InjectionResult {
  findings: Finding[];
  checked: number;
}

export function runInjectionGuard(): InjectionResult {
  const sources = collectSources(["src"], [".ts", ".tsx"]);
  const findings: Finding[] = [];

  for (const file of sources) {
    for (const rule of RULES) {
      eachMatch(file.text, rule.re, (match, line) => {
        findings.push({
          rule: rule.rule,
          severity: rule.severity,
          message: rule.message,
          file: file.relPath,
          line,
          evidence: match[0].slice(0, 80),
        });
      });
    }
  }

  return { findings, checked: sources.length };
}

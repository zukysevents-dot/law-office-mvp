import path from "node:path";

import { Finding, Severity } from "../lib/findings";
import { REPO_ROOT } from "../lib/paths";
import { gitTrackedFiles, lineAt, readIfText } from "../lib/walk";

// Files allowed to contain secret-shaped strings (templates / lockfiles / this
// pipeline's own docs that describe patterns). Everything else tracked by git is
// scanned. Local .env* are gitignored, so they never reach this scan.
const ALLOWLISTED_FILES = new Set([
  ".env.example",
  "package-lock.json",
]);
const ALLOWLISTED_DIR_PREFIXES = ["docs/prod-readiness/"];

// Values that are obviously placeholders, not real secrets. Includes bracketed
// and templated forms (e.g. `[HESLO]`, `<your-secret>`, `${ENV}`).
const PLACEHOLDER_RE =
  /^(?:change[-_ ]?me|changeme|your[-_]|example|placeholder|xxx+|<.*>|\[.*\]|\$\{.*\}|process\.env|dummy|test|secret|password|token|redacted|\*+)$/i;

interface Rule {
  rule: string;
  severity: Severity;
  re: RegExp;
  // If set, capture group N is the candidate value tested against PLACEHOLDER_RE.
  valueGroup?: number;
  message: string;
}

const RULES: Rule[] = [
  {
    rule: "secret/private-key",
    severity: "CRITICAL",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
    message: "Privátní klíč (PEM blok) v trackovaném souboru.",
  },
  {
    rule: "secret/pg-url-with-password",
    severity: "HIGH",
    re: /postgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]{3,})@[^\s/]+/,
    valueGroup: 1,
    message: "Connection string s vloženým heslem v trackovaném souboru.",
  },
  {
    rule: "secret/aws-access-key",
    severity: "CRITICAL",
    re: /\bAKIA[0-9A-Z]{16}\b/,
    message: "AWS access key ID v trackovaném souboru.",
  },
  {
    rule: "secret/jwt-or-supabase-key",
    severity: "HIGH",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/,
    message: "JWT / Supabase service key v trackovaném souboru.",
  },
  {
    rule: "secret/generic-assignment",
    severity: "HIGH",
    // Value must be a contiguous token-like string (≥16 chars, base64/hex/url
    // charset, NO spaces) so natural-language UI strings like
    // `password: "Heslo musí mít alespoň 8 znaků."` are not flagged.
    re: /(?:SECRET|TOKEN|PASSWORD|PASSWD|API[-_]?KEY|PRIVATE[-_]?KEY|ACCESS[-_]?KEY)["']?\s*[:=]\s*["']([A-Za-z0-9+/=_-]{16,})["']/i,
    valueGroup: 1,
    message: "Pevně zapsané tajemství (SECRET/TOKEN/PASSWORD/API_KEY) v trackovaném souboru.",
  },
];

function isAllowlisted(relPath: string): boolean {
  const base = path.basename(relPath);
  if (ALLOWLISTED_FILES.has(base)) {
    return true;
  }
  return ALLOWLISTED_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

export interface SecretResult {
  findings: Finding[];
  checked: number;
}

export function runSecretGuard(): SecretResult {
  const findings: Finding[] = [];
  const tracked = gitTrackedFiles();
  let checked = 0;

  for (const rel of tracked) {
    if (isAllowlisted(rel)) {
      continue;
    }
    const text = readIfText(path.join(REPO_ROOT, rel));
    if (text === null) {
      continue;
    }
    checked += 1;

    for (const rule of RULES) {
      const global = new RegExp(rule.re.source, "gi");
      let m: RegExpExecArray | null;
      while ((m = global.exec(text)) !== null) {
        if (rule.valueGroup) {
          const value = m[rule.valueGroup] ?? "";
          if (PLACEHOLDER_RE.test(value.trim())) {
            continue;
          }
        }
        findings.push({
          rule: rule.rule,
          severity: rule.severity,
          message: rule.message,
          file: rel,
          line: lineAt(text, m.index),
          // Never echo the secret itself — just enough to locate it.
          evidence: `${m[0].slice(0, 12)}… (zkráceno)`,
        });
        if (m.index === global.lastIndex) {
          global.lastIndex += 1;
        }
      }
    }
  }

  return { findings, checked };
}

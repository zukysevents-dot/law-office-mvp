import { emptyGate, Finding, GateResult } from "../lib/findings";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runSecretGuard } from "../guards/secret-guard";

// A3 — Secrets. Skenuje trackovaný strom (git ls-files) na klíče/hesla/tokeny.
// Plný scan historie dělá gitleaks v CI (.gitleaks.toml). Lokální .env* jsou
// gitignorované, takže do scanu nespadnou — to je správně.
export async function gateA3(): Promise<GateResult> {
  const gate = emptyGate("A3", "Secrets");
  const secret = runSecretGuard();
  gate.passes = Math.max(0, secret.checked - secret.findings.length);
  gate.notes.push(
    `Secret guard: prohledáno ${secret.checked} trackovaných textových souborů ` +
      "(allowlist: .env.example, package-lock.json, docs/prod-readiness/).",
  );
  gate.notes.push(
    "Historii commitů skenuje gitleaks v CI (.github/workflows/prod-readiness.yml).",
  );
  const raw: Finding[] = [...secret.findings];
  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA3);

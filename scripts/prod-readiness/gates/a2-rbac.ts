import { emptyGate, Finding, GateResult } from "../lib/findings";
import { runNodeTests } from "../lib/node-tests";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runAuthzGuard } from "../guards/authz-guard";

// A2 — Autorizace uvnitř tenanta (RBAC). Negativní testy (junior role zkouší
// admin akce / cizí objekty ve své firmě → odepřeno) + authz guard hledající
// mutace, které ověřují jen přihlášení, ne oprávnění na akci.
export async function gateA2(): Promise<GateResult> {
  const gate = emptyGate("A2", "Autorizace uvnitř tenanta (RBAC)");
  const raw: Finding[] = [];

  const tests = runNodeTests(["src/lib/security/rbac-negative.test.ts"], "a2-tests");
  gate.externalJunit.push(tests.junitPath);
  if (!tests.ok) {
    raw.push({
      rule: "rbac/negative-tests-failed",
      severity: "CRITICAL",
      message:
        `RBAC negativní testy selhaly (${tests.failures} z ${tests.tests}) — ` +
        "běžný uživatel získal admin/cizí přístup. Viz junit a2-tests.xml.",
    });
  } else {
    gate.passes += tests.tests;
    gate.notes.push(`RBAC negativní testy: ${tests.tests} OK (přístup odepřen dle role).`);
  }

  const authz = runAuthzGuard();
  raw.push(...authz.findings);
  gate.passes += Math.max(0, authz.checked - authz.findings.length);
  gate.notes.push(
    `Authz guard: zkontrolováno ${authz.checked} autentizovaných mutujících akcí.`,
  );

  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA2);

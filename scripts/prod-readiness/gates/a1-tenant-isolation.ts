import { emptyGate, Finding, GateResult } from "../lib/findings";
import { runNodeTests } from "../lib/node-tests";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runMcpScopeGuard } from "../guards/mcp-scope-guard";
import { runTenantScopeGuard } from "../guards/tenant-scope-guard";

// A1 — Tenant izolace (první gate). Negativní cross-tenant testy + statický
// tenant-scope guard + MCP-scope (dopředný) guard.
export async function gateA1(): Promise<GateResult> {
  const gate = emptyGate("A1", "Tenant izolace");
  const raw: Finding[] = [];

  // (1) Negativní cross-tenant testy (strukturální, bez DB).
  const tests = runNodeTests(
    ["src/lib/security/cross-tenant.test.ts", "src/lib/permissions.test.ts"],
    "a1-tests",
  );
  gate.externalJunit.push(tests.junitPath);
  if (!tests.ok) {
    raw.push({
      rule: "tenant/negative-tests-failed",
      severity: "CRITICAL",
      message:
        `Negativní cross-tenant testy selhaly (${tests.failures} z ${tests.tests}) — ` +
        "přístup NEBYL odepřen tam, kde měl být. Viz junit a1-tests.xml.",
    });
  } else {
    gate.passes += tests.tests;
    gate.notes.push(`Negativní cross-tenant + permissions testy: ${tests.tests} OK.`);
  }

  // (2) Statický tenant-scope guard.
  const tenant = runTenantScopeGuard();
  raw.push(...tenant.findings);
  gate.passes += Math.max(0, tenant.checked - tenant.findings.length);
  gate.notes.push(`Tenant-scope guard: zkontrolováno ${tenant.checked} list/mutate Prisma volání.`);

  // (3) MCP-scope (dopředný) guard — dnes v repu žádný MCP server.
  const mcp = runMcpScopeGuard();
  raw.push(...mcp.findings);
  if (mcp.registrations === 0) {
    gate.notes.push(
      "MCP sub-fáze: N/A — v repu nejsou registrace MCP toolů (0). Toto NENÍ ověřená kontrola, " +
        "jen dopředný guard; viz risk register (B3) a poznámka v plánu.",
    );
  } else {
    gate.notes.push(`MCP-scope guard: zkontrolováno ${mcp.registrations} registrací MCP toolů.`);
  }

  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA1);

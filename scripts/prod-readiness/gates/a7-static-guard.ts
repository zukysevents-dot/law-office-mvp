import { emptyGate, Finding, GateResult } from "../lib/findings";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runAuthzGuard } from "../guards/authz-guard";
import { runInjectionGuard } from "../guards/injection-guard";
import { runMcpScopeGuard } from "../guards/mcp-scope-guard";
import { runPaginationGuard } from "../guards/pagination-guard";
import { runSecretGuard } from "../guards/secret-guard";
import { runTenantScopeGuard } from "../guards/tenant-scope-guard";

// A7 — Rozšířený statický guard (dopředný backstop). Spustí UNII všech statických
// guardů jako jeden příkaz pro pre-commit / PR: budoucí kód neprojde, když přibude
// query bez tenant scope, MCP tool bez scope, endpoint bez authz, nebezpečný
// pattern, nový secret nebo unbounded list query.
//
// Záměrně překrývá guardové části A1/A2/A3/A5/A6 — to je smysl backstopu. V
// orchestraci run-all jsou nálezy v globálním žebříčku deduplikovány, takže se
// nezdvojují; verdikt (red/green) tím není ovlivněn.
export async function gateA7(): Promise<GateResult> {
  const gate = emptyGate("A7", "Rozšířený statický guard (forward backstop)");
  const raw: Finding[] = [];

  const tenant = runTenantScopeGuard();
  const authz = runAuthzGuard();
  const injection = runInjectionGuard();
  const secret = runSecretGuard();
  const pagination = runPaginationGuard();
  const mcp = runMcpScopeGuard();

  raw.push(
    ...tenant.findings,
    ...authz.findings,
    ...injection.findings,
    ...secret.findings,
    ...pagination.findings,
    ...mcp.findings,
  );

  const checked =
    tenant.checked +
    authz.checked +
    injection.checked +
    secret.checked +
    pagination.checked;
  gate.passes = Math.max(0, checked - raw.length);

  gate.notes.push(
    "Union guardů: tenant-scope + authz + injection + secret + pagination + mcp-scope.",
  );
  gate.notes.push(
    "Použij jako jediný pre-merge příkaz: `npm run gate:a7`. Nové statické porušení = červená.",
  );
  if (mcp.registrations === 0) {
    gate.notes.push("MCP-scope: 0 registrací (N/A, dopředný guard).");
  }

  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA7);

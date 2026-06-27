import { emptyGate, Finding, GateResult } from "../lib/findings";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runPaginationGuard } from "../guards/pagination-guard";
import { runQueryCounter } from "../perf/query-counter";

// A6 — Výkon (smoke). Statický pagination guard (unbounded findMany na list
// stránkách) + DB query-counter, který bez DATABASE_URL_TEST čestně SKIPne.
export async function gateA6(): Promise<GateResult> {
  const gate = emptyGate("A6", "Výkon (smoke / N+1)");
  const raw: Finding[] = [];

  const pagination = runPaginationGuard();
  raw.push(...pagination.findings);
  gate.passes += Math.max(0, pagination.checked - pagination.findings.length);
  gate.notes.push(
    `Pagination guard: zkontrolováno ${pagination.checked} findMany volání na list stránkách.`,
  );

  const counter = await runQueryCounter();
  raw.push(...counter.findings);
  gate.skips.push(...counter.skips);
  gate.passes += counter.passes;
  gate.notes.push(...counter.notes);

  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA6);

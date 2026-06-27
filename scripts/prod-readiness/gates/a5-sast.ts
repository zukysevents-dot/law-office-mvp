import { emptyGate, Finding, GateResult } from "../lib/findings";
import { finalizeGate, runStandalone } from "../lib/standalone";
import { runInjectionGuard } from "../guards/injection-guard";

// A5 — Static / Injection (SAST). Pure-Node injection guard nad src/. Hlubší
// pravidla pro Next.js server actions přidává semgrep v CI (.semgrep.yml).
// Nálezy jsou seřazené dle rizika v reportu.
export async function gateA5(): Promise<GateResult> {
  const gate = emptyGate("A5", "Static / Injection (SAST)");
  const injection = runInjectionGuard();
  gate.passes = injection.checked;
  gate.notes.push(`Injection guard: prohledáno ${injection.checked} zdrojových souborů v src/.`);
  gate.notes.push("Doplňkový SAST (semgrep) běží v CI; parametrizovaný $queryRaw se záměrně neflaguje.");
  const raw: Finding[] = [...injection.findings];
  return finalizeGate(gate, raw);
}

void runStandalone(import.meta.url, gateA5);

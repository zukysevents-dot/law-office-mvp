# Prod-readiness pipeline

Rozšířená CI brána složená z **samostatných gate fází**. Cílem je **najít díry a
shodit build**, ne je tiše opravit. Pipeline má dvě části:

- **ČÁST A — automatizované gaty** (A1–A7). Padají build. Výstup: JUnit XML + `report.md`.
- **ČÁST B — risk register** ([`RISK-REGISTER.md`](RISK-REGISTER.md)). To, co agent NEUMÍ
  spolehlivě otestovat → stav `[MÁME / NEMÁME / NEVÍM]` + důkaz + riziko.
  **Tato část se NEoznačuje jako „passed".**

## Co znamená „build zelený"

> **Build je zelený jen tehdy, když všechny gaty A nemají blokující nález A ZÁROVEŇ
> existuje vygenerovaný risk register B.** SKIP není pass. Zelená ČÁSTI A
> **neznamená**, že rizika v ČÁSTI B jsou vyřešená — ta jsou k lidskému rozhodnutí.

## Spuštění

```bash
npm run prod-readiness     # spustí A1–A7, vyrobí reports/prod-readiness/{junit,report.md}
npm run gate:a1            # jednotlivý gate (a1 … a7)
npm run gate:a7            # rozšířený statický guard = jediný pre-merge příkaz
```

CI workflow spouští `lint → test → build → prod-readiness` a navíc gitleaks (historie)
a semgrep (SAST) na Linux runneru. Artefakty (JUnit + report) se nahrávají vždy.

> **Instalace CI:** workflow je v repu jako [`prod-readiness.workflow.yml`](prod-readiness.workflow.yml)
> — zkopíruj ho do `.github/workflows/prod-readiness.yml` (přes GitHub web UI, nebo
> lokálně po `gh auth refresh -h github.com -s workflow`). Nemohl být commitnut přímo
> do `.github/workflows/` kvůli chybějícímu `workflow` scope u push tokenu.

## Gaty (ČÁST A)

| Gate | Co dělá | Jak padá |
|------|---------|----------|
| **A1 Tenant izolace** | negativní cross-tenant testy (`src/lib/security/cross-tenant.test.ts` + `permissions.test.ts`) + statický tenant-scope guard + MCP-scope (dopředný) guard | test selhal / query bez tenant scope |
| **A2 RBAC** | negativní testy (junior zkouší admin/cizí akce ve své firmě → odepřeno) + authz guard | test selhal / mutace bez autorizace |
| **A3 Secrets** | secret guard nad trackovaným stromem; gitleaks nad historií v CI | secret v trackovaném souboru / historii |
| **A4 Závislosti** | `npm audit --json` | high/critical zranitelnost |
| **A5 SAST/Injection** | injection guard nad `src/`; semgrep v CI | raw unsafe SQL / exec / eval / dangerous HTML |
| **A6 Výkon (N+1)** | pagination guard (unbounded findMany na list stránkách) + DB query-counter | unbounded list query / N+1 (s test DB) |
| **A7 Rozšířený statický guard** | union všech statických guardů — dopředný backstop pro budoucí kód | jakékoli nové statické porušení |

### Semantika negativních testů

Negativní test je **zelený jen když je přístup ODEPŘEN** (`assert.throws(...)` /
`=== false`). Když denial zmizí, test padá → build červený. To je přesně to chování,
které chceme: gaty jsou zelené jen tehdy, když všechny negativní testy správně selhaly.

### SKIP ≠ pass

Když chybí předpoklad (test DB pro A6, konektivita pro `npm audit`, žádný MCP server
pro MCP-scope), gate to reportuje jako **`skipped`** v JUnit i v `report.md`. **Nikdy**
to není zelená. Naopak — řádek SKIPPED v reportu je explicitní „neověřeno".

## Očekávaný výsledek prvního běhu

Pipeline je navržená tak, aby **na prvním běhu byla nejspíš ČERVENÁ**:

- **A6** spadne — list stránky (`subjects`, `projects`, `cases`, `work-logs`) mají
  `findMany` **bez `take`/paginace**.
- **A4** může spadnout podle aktuálních `npm audit` high/critical.

**Tyto červené se v rámci pipeline NEopravují v produkční logice** (najít díru ≠ tiše
ji zalepit). Remediace (přidat paginaci, upgradovat závislost) je samostatný,
odsouhlasený krok.

## Allowlist (vědomé přijetí nálezu)

Jediný způsob, jak nález přestane blokovat build, je **explicitní lidský podpis** v
[`scripts/prod-readiness/lib/allowlist.ts`](../../scripts/prod-readiness/lib/allowlist.ts)
— záznam s `reason` a `acceptedBy`. Přijaté nálezy se v reportu vypisují zvlášť
(sekce „Vědomě přijaté nálezy"). **Není to tichá změna kódu kvůli zelené.** Allowlist
používej jen pro doložené false-positivy guardů, ne pro reálné díry.

## Struktura

```
scripts/prod-readiness/
  run-all.ts            # orchestrátor (agregace JUnit + report.md + verdikt)
  lib/                  # findings, junit, report, walk, allowlist, standalone, node-tests, paths
  guards/               # tenant-scope, mcp-scope, authz, injection, secret, pagination
  gates/                # a1 … a7 (každý spustitelný i samostatně přes npm run gate:aN)
  perf/query-counter.ts # DB-backed N+1 měření (SKIP bez DATABASE_URL_TEST)
src/lib/security/       # negativní testy (běží i ve `npm run test`)
docs/prod-readiness/    # README + RISK-REGISTER (ČÁST B)
reports/prod-readiness/ # výstup (gitignored)
```

# Risk register — ČÁST B (NEautomatizovatelné)

Tohle **NENÍ** automatizovaný gate a **NEoznačuje se jako „passed".** Je to přehled
oblastí, které agent neumí spolehlivě otestovat, k **lidskému rozhodnutí**.

Pravidla:
- Stav je `MÁME` **jen s konkrétním důkazem** (odkaz na kód/config/dokument).
- Bez důkazu je stav `NEVÍM` — nikdy ne `MÁME`.
- `NEMÁME` = ověřeno, že to chybí.

Seřazeno dle **dopadu** (nejhorší nahoře).

| # | Oblast | Stav | Důkaz / kde ověřit | Riziko když selže |
|---|--------|------|--------------------|-------------------|
| **B4** | Zero-downtime deploy + migrace schématu napříč firmami | 🟥 **NEMÁME** zero-downtime · MÁME mechanismus migrace | `npm run db:deploy` = `prisma migrate deploy` ([DEPLOYMENT.md](../../DEPLOYMENT.md):81); sdílené schéma — všechny firmy v jedné DB ([prisma/schema.prisma](../../prisma/schema.prisma)); žádný expand-contract / blue-green | **HIGH** — jedna vadná migrace rozbije **všechny** tenanty najednou, bez možnosti postupného rolloutu |
| **B6** | Disaster recovery (ztráta celé instance) | 🟧 **NEVÍM** | žádný DR runbook v repu; závislé na Supabase + Vercel | **HIGH** — nedefinované RTO/RPO, netestovaný failover, žádný majitel postupu |
| **B2** | Zálohy + OVĚŘENÉ obnovení | 🟥 **NEMÁME** ověřené obnovení · 🟧 NEVÍM zálohy | [DEPLOYMENT.md](../../DEPLOYMENT.md):131 zálohy jen **doporučuje** („zapni PITR/denní zálohy"), není doloženo zapnutí; žádný restore drill | **HIGH** — ztráta dat; záloha, kterou nikdo nezkusil obnovit, není záloha |
| **B5** | Lifecycle tenanta: offboarding, export, smazání na vyžádání | 🟥 **NEMÁME** export i erase-on-request | [src/app/actions/organizations.ts](../../src/app/actions/organizations.ts) má join/create/update/deactivateMember, ale **žádný** `exportOrganization` ani `deleteOrganization`; cascade delete existuje na schématu, ale není auditovaná akce | **HIGH** — GDPR čl. 17 (výmaz) a čl. 20 (přenositelnost) nelze splnit na vyžádání |
| **B1** | GDPR / zpracovatelské smlouvy / kde data fyzicky leží | 🟨 **částečně MÁME** | data v EU: Supabase `eu-west-3` (host v `DATABASE_URL`, [DEPLOYMENT.md](../../DEPLOYMENT.md)); šifrování citlivých polí: [src/lib/crypto.ts](../../src/lib/crypto.ts) + `DATA_ENCRYPTION_KEY`; **DPA se Supabase/Vercel/SMTP = NEVÍM**; secrets v OneDrive-synced složce = riziko | **MED-HIGH** — GDPR čl. 28 (zpracovatel), únik secrets přes cloud sync |
| **B3** | Monitoring a alerting (pád MCP/DB) | 🟥 **NEMÁME** alerting · 🟩 MÁME graceful degradaci | žádná Sentry/APM dependency v [package.json](../../package.json); ale [src/lib/db-safe.ts](../../src/lib/db-safe.ts) degraduje UI při DB-down (Czech notice) | **MED** — výpadek DB/služby proběhne tiše, nikdo není upozorněn |

---

## Detaily a doporučený další krok

### B4 — Zero-downtime deploy + migrace napříč firmami · NEMÁME (HIGH)
**Důkaz:** Nasazení migrací je `prisma migrate deploy` ([DEPLOYMENT.md](../../DEPLOYMENT.md):81).
Architektura je sdílené schéma (jedna DB, `organizationId` na tabulkách), takže každá
migrace platí pro všechny firmy současně. V repu není expand-contract postup ani
blue-green/canary deploy.
**Co chybí:** dvoufázové (expand → migrate data → contract) migrace, ověření na staging
kopii produkce, plán rollbacku.
**Další krok (lidské rozhodnutí):** zavést expand-contract konvenci pro migrace + povinný
dry-run proti kopii produkční DB před `migrate deploy`.

### B6 — Disaster recovery · NEVÍM (HIGH)
**Důkaz:** v repu není žádný DR runbook ani definované RTO/RPO. Obnova závisí výhradně
na platformách Supabase + Vercel.
**Co chybí:** dokumentovaný postup „ztratili jsme celou instanci", vlastník, otestovaný
failover.
**Další krok:** sepsat DR runbook (kde jsou zálohy, kdo obnovuje, cílové RTO/RPO) a jednou
ho nasucho projít.

### B2 — Zálohy + ověřené obnovení · NEMÁME ověřené obnovení (HIGH)
**Důkaz:** [DEPLOYMENT.md](../../DEPLOYMENT.md):131 zálohy pouze **doporučuje** („zapni
Point-in-Time Recovery / denní zálohy v Supabase") — není doklad, že jsou zapnuté, a
neexistuje žádný záznam o zkušebním obnovení.
**Co chybí:** potvrzení, že zálohy běží + pravidelný **restore drill** (obnova do čisté DB
a kontrola integrity).
**Další krok:** ověřit zapnutí PITR ve Supabase a naplánovat čtvrtletní restore drill.

### B5 — Lifecycle tenanta (offboarding/export/erase) · NEMÁME (HIGH)
**Důkaz:** [src/app/actions/organizations.ts](../../src/app/actions/organizations.ts)
obsahuje `joinOrganization`, `createJoinCode`, `revokeJoinCode`, `changeMemberRole`,
`deactivateMember`, `createOrganization`, `updateOrganization`, `setOrganizationModule` —
ale **žádnou** akci pro export dat firmy ani pro smazání firmy na vyžádání. Cascade delete
sice existuje na úrovni schématu, ale není za ním auditovaná, ověřená offboarding akce.
**Co chybí:** export všech dat firmy (strojově čitelný) + auditovaný, potvrzovaný erase.
**Další krok:** navrhnout `exportOrganization` (GDPR čl. 20) a `deleteOrganization`
(GDPR čl. 17) s auditním záznamem a potvrzením.

### B1 — GDPR / DPA / data residency · částečně MÁME (MED-HIGH)
**Důkaz:** Data leží v EU (Supabase region `eu-west-3` v `DATABASE_URL`). Citlivá pole se
šifrují aplikačně ([src/lib/crypto.ts](../../src/lib/crypto.ts), `DATA_ENCRYPTION_KEY`).
**Co chybí / NEVÍM:** podepsané zpracovatelské smlouvy (DPA) se Supabase, Vercel a SMTP
providerem; navíc lokální `.env*` se secrets leží ve OneDrive-synced složce (riziko úniku
přes cloud sync — viz [memory note](../../) o deploy).
**Další krok:** doložit/uzavřít DPA s každým zpracovatelem; přesunout produkční secrets mimo
cloud-synced složku do secret manageru.

### B3 — Monitoring a alerting · NEMÁME alerting (MED)
**Důkaz:** v [package.json](../../package.json) není žádná Sentry/APM/OpenTelemetry závislost.
Pozitivně: [src/lib/db-safe.ts](../../src/lib/db-safe.ts) drží UI naživu při výpadku DB
(graceful degradation s českou hláškou), takže pád neshodí celou appku.
**Co chybí:** aktivní alerting — když spadne DB, SMTP nebo (budoucí) MCP server, nikdo není
upozorněn; selhání notifikačního cronu se nereportuje.
**Další krok:** napojit error/uptime monitoring (např. Sentry) + alert na selhání
`POST /api/internal/notifications/run`.

---

_Tento přehled je vstup k lidskému rozhodnutí. Zelená ČÁSTI A na něm nic nemění._

# E2E testy (Playwright)

Sada pokrývá veřejné stránky, přihlášení, aplikační shell, všechny hlavní
moduly, CRUD flow, role/oprávnění, okrajové stavy a základní přístupnost.

## Spuštění

```bash
npm run test:e2e
```

Jeden příkaz udělá všechno: připraví testovací databázi, sestaví aplikaci,
spustí server a projede testy v Chromiu.

Další skripty:

```bash
npm run test:e2e:ui        # interaktivní UI mód Playwrightu
npm run test:e2e:report    # otevře HTML report z posledního běhu
```

Užitečné přepínače:

```bash
npm run test:e2e -- -g "duplicitní IČO"    # jen vybrané testy
npm run test:e2e -- --headed               # s viditelným prohlížečem
E2E_ALL_BROWSERS=1 npm run test:e2e        # + Firefox a WebKit (nutné `npx playwright install`)
```

## Prostředí

- **Vlastní databáze.** Testy běží proti `law_office_e2e` na stejném lokálním
  Postgresu (`docker compose up -d`). Vývojářská `law_office_mvp` se nikdy
  nepoužívá ani nemaže. `tests/e2e/support/global-setup.ts` databázi vytvoří,
  spustí `prisma migrate deploy` + `prisma/seed.ts`, zapne všechny moduly a
  smaže záznamy z předchozích běhů (jen ty s prefixem `e2e-`).
- **Vlastní build.** `NEXT_DIST_DIR=.next-e2e`, takže běžící `npm run dev`
  nemůže přijít o svou `.next` cache. Server jede na portu `3101`.
- **Žádné vedlejší efekty.** SMTP, ARES, ISDS, SharePoint i sankční seznamy jsou
  v `tests/e2e/support/e2e-env.ts` vypnuté — testy neposílají e-maily, nevolají
  externí API a neodesílají datové zprávy.
- **Přihlášení.** Projekt `auth` se jednou přihlásí za každou seedovanou roli
  (`admin`, `partner`, `advokát`, `koncipient`, `praktikant`, platform admin) a
  uloží session do `tests/e2e/.auth/`. Ostatní testy ji jen znovu použijí — je to
  rychlé a nenaráží to na limit přihlašovacích pokusů (30/IP/15 min).

Přihlašovací údaje odpovídají `prisma/seed.ts`: `*.demo@example.local`
s heslem `demo1234` (viz `SEED_USER_PASSWORD`).

## Struktura

| Soubor | Co ověřuje |
| --- | --- |
| `public-pages.spec.ts` | landing, login, registrace, neznámá cesta → přihlášení, mobilní viewport |
| `auth.spec.ts` | redirecty na `/login`, návrat na původní stránku, chybné přihlášení, odhlášení, ochrana `from` |
| `navigation.spec.ts` | shell, levé menu, `aria-current`, skip-link, ⌘K paleta, mobilní menu |
| `modules.spec.ts` | každý modul: URL + `h1` + klíčová sekce; detaily nad seedovanými ID |
| `roles-and-permissions.spec.ts` | viditelnost v menu, přímé URL na chráněné stránky, sazby, výchozí viditelnost pro všechny role, matice oprávnění (utažení role, výjimka uživatele, audit), organizační kontext |
| `subjects-flow.spec.ts` | hledání, filtry, vytvoření, validace, diakritika, duplicitní IČO, 404 |
| `subjects-types-contacts.spec.ts` | fyzická osoba (RČ, datum narození), FOP, více e-mailů/telefonů, statutární orgány, conflict check a hledání podle kontaktů a RČ (maskované), oprávnění, audit, mobil |
| `tasks-and-worklogs.spec.ts` | úkoly, změna statusu, komentáře, výkazy práce, reporty |
| `responsive-and-accessibility.spec.ts` | 3 viewporty, jediný `h1`, popisky, klávesnice, hlavičky tabulek, screenshoty |
| `overlays.spec.ts` | pop-upy (paleta, výkaz, sloupce, potvrzení, mobilní menu, landing): ×, Esc, klik mimo bez prokliknutí |
| `responsiveness.spec.ts` | akce se projeví bez reloadu, pending stav tlačítek, rychlá navigace |
| `worklog-duplicate.spec.ts` | duplikace výkazu ze seznamu i z úpravy, dnešní datum, koncipient bez sazby, neplatné ID |
| `billing-pickers.spec.ts` | fakturace: subjekt → jen jeho projekty a případy (filtr, nová faktura, paušál, úprava výkazu) |
| `billing-approvals.spec.ts` | fronta ke schválení: filtry v URL, celý popis úkonu, hromadné schválení/zamítnutí, vstup z výkazů, role, mobil |
| `teams-and-assignees.spec.ts` | Týmy a řešitelé: založení a přejmenování týmu, duplicitní název, hromadné přiřazení / odebrání týmu (potvrzení), sloupec a filtr „Řešitelé“, detail projektu a případu (zdědění řešitelé), notifikace, audit |
| `task-people.spec.ts` | Úkoly: více řešitelů (hlavní první) a dohled, rozbalení týmu na členy, dohled komentuje a mění status, ale neupraví, „Moje úkoly“ s filtrem role, notifikace (DB), audit lidí na úkolu, filtry Řešitel/Dohled, CSV export, „Moje úkoly“ ve výběru úkolu u výkazu, dashboard |
| `task-productivity.spec.ts` | Úkoly: duplikace („uložit jako“, odkaz na zdroj, komentáře se nekopírují), „Vykázat práci“ z detailu i seznamu (předvyplněná věc a úkol, koncipient bez sazby, dokončený úkol), filtry archivu (měsíc, tento měsíc, vlastní rozsah, datum založení, řešitel, zadavatel, projekt), odložení s důvodem (historie, štítek „odloženo N×“, notifikace, audit, znovunastavení připomínky), dohled neodkládá |
| `performance-kpi.spec.ts` | KPI a Výkonnost: plán hodin se 4 cíli (uložení bez reloadu, validace, audit), graf „Přehled hodin“ na dashboardu (sloupce mají výšku, cílové značky, Týden/Měsíc, koncipient bez částek, mobil), stránka Výkonnost (přesná čísla ve fixním okně 3.–9. 3. 2025, filtry, řazení, předchozí období, úkoly po termínu u více řešitelů, detail osoby, docházka a absence z HR, export XLSX + audit, přístup partner / advokát / koncipient, mobil) |
| `users-invitations.spec.ts` | založení uživatele, pozvánka (SMTP vypnuté), znovuodeslání, `/set-password` |
| `deadlines-fulfilment.spec.ts` | lhůty: „Splněno…“ s poznámkou, „Splnit a archivovat“, záložky Aktivní/Splněné/Archiv, obnovení, vrácení mezi aktivní, „Později“, žádná upozornění po splnění, role, detail spisu, kalendář, audit |
| `calendar-outlook.spec.ts` | Outlook (ICS): návod a české chyby, SSRF ochrana (jen IP adresy, bez sítě), události z vloženého feedu (čas, celodenní, opakování), přepínač, detail jen pro čtení, izolace mezi uživateli, maska odkazu, odpojení; čas soudního jednání |

Pomocné funkce jsou v `tests/e2e/support/helpers.ts`.

## Známá omezení

- **Matice oprávnění a paralelní běh.** Testy, které roli Praktikant v matici
  utahují nebo jí dávají výjimku, běží v sériovém bloku
  (`roles-and-permissions.spec.ts`, „praktikant a matice oprávnění“) a vždy
  vrací výchozí stav (`finally`). Žádný jiný spec se praktikantem nepřihlašuje.
  `prepare-e2e-db.ts` na začátku běhu smaže všechny řádky
  `rolePermissionOverrides` / `userPermissionOverrides` (jen E2E databáze).
  Stejně tak test „praktikant … uvidí projekt až přes tým“ (přiřazení přes
  tým a dynamické členství) je v tomto sériovém bloku;
  `teams-and-assignees.spec.ts` pracuje jen s administrátorem, vlastním
  `e2e-` týmem a `e2e-` projekty (Partner Demo jako člen týmu). Týmy a
  projekty s prefixem `e2e-` maže `prepare-e2e-db.ts` na začátku běhu.
  Dohled praktikanta na úkolu (balík 05) se ověřuje ve stejném sériovém bloku
  na úkolu mimo projekt a `finally` praktikanta z lidí na `e2e-` úkolech
  odebere; `task-people.spec.ts` praktikanta nepoužívá a seedovaný tým
  „Sporná agenda“ jen čte. Widget „Moje úkoly“ koncipienta si test dočasně
  vloží a zase smaže (jen E2E databáze).

- **KPI a Výkonnost.** `performance-kpi.spec.ts` ověřuje přesná čísla jen ve
  fixním historickém okně 3.–9. 3. 2025, kam jiné specy nic nezapisují; v
  aktuálním týdnu/měsíci jen „> 0“ / „≥“, protože paralelní specy přidávají
  advokátovi výkazy a úkoly. Plán hodin advokáta (40 / 30 / 160 / 120 h) platí
  jen během souboru (`afterAll` plány smaže, `prepare-e2e-db.ts` maže všechny
  `userHoursPlans` na začátku běhu). Seedovaní uživatelé v už seedované DB mají
  legacy widget „Hodiny tento měsíc“ — graf „Přehled hodin“ si test dočasně
  vloží (id `e2e-…`). Výjimka „Výkonnost“ pro praktikanta se ověřuje v sériovém
  bloku `roles-and-permissions.spec.ts`.
- **Žádný route-level `loading.tsx`.** V Next 16.2.9 způsoboval
  `src/app/(app)/loading.tsx` (a stejné soubory v `(portal)` a `admin`), že se
  po server action s `revalidatePath()` / `redirect()` i po `router.refresh()`
  stránka s bohatším obsahem nepřekreslila – tlačítko zůstalo „busy“ a změna
  byla vidět až po ručním obnovení; každá navigace navíc čekala ~700 ms na
  skeleton. Boundary jsou odstraněné (hlídá to `src/app/loading-boundaries.test.ts`),
  zpětnou vazbu dává horní progress bar (`NavigationProgress`) a pending stav
  odesílacích tlačítek. Všechny akce (`updateTaskStatus`, `addTaskComment`,
  `createWorkLog`, sloupce tabulek, `createSubject` …) se teď projeví hned a
  testy už žádný reload nepotřebují (`responsiveness.spec.ts`). Potřebuje-li
  stránka streamování, použijte lokální `<Suspense>`, nikdy `loading.tsx`.
- **Progress bar a transition routeru.** `onRouterTransitionStart`
  (`src/instrumentation-client.ts`) běží uvnitř `startTransition` routeru;
  běžný `setState` odtud by se vykreslil až spolu s novou stránkou, tedy nikdy.
  `NavigationProgress` proto drží stav v externím store
  (`useSyncExternalStore`), jehož změny React vykreslí hned. Testy se
  zpomaleným RSC (`responsiveness.spec.ts`) otevírají stránku s
  `waitUntil: "networkidle"` – klik před hydratací by byl tvrdý přechod bez
  klientského routeru.
- **Registrace se v testech nedokončuje** — vyžadovala by SMTP. Ověřuje se jen
  dostupnost a přístupnost formuláře.
- **Bez pokrytí:** ARES/ISIR lookup, ISDS (datové zprávy), SharePoint/Graph,
  samotné doručení e-mailů přes SMTP a notifikační cron, klientský portál
  (magic link přes e-mail), platební/Pohoda exporty. Všechno vyžaduje externí
  integraci. Pozvánky nových uživatelů jsou pokryté až po odeslání: hláška
  adminovi při vypnutém SMTP, „Znovu poslat pozvánku“ a celý průchod odkazem
  `/set-password` (`users-invitations.spec.ts`, token se vkládá přímo do DB).

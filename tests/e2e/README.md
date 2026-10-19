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
| `roles-and-permissions.spec.ts` | viditelnost v menu, přímé URL na chráněné stránky, sazby, organizační kontext |
| `subjects-flow.spec.ts` | hledání, filtry, vytvoření, validace, diakritika, duplicitní IČO, 404 |
| `tasks-and-worklogs.spec.ts` | úkoly, změna statusu, komentáře, výkazy práce, reporty |
| `responsive-and-accessibility.spec.ts` | 3 viewporty, jediný `h1`, popisky, klávesnice, hlavičky tabulek, screenshoty |
| `overlays.spec.ts` | pop-upy (paleta, výkaz, sloupce, potvrzení, mobilní menu, landing): ×, Esc, klik mimo bez prokliknutí |
| `responsiveness.spec.ts` | akce se projeví bez reloadu, pending stav tlačítek, rychlá navigace |
| `users-invitations.spec.ts` | založení uživatele, pozvánka (SMTP vypnuté), znovuodeslání, `/set-password` |

Pomocné funkce jsou v `tests/e2e/support/helpers.ts`.

## Známá omezení

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
- **Registrace se v testech nedokončuje** — vyžadovala by SMTP. Ověřuje se jen
  dostupnost a přístupnost formuláře.
- **Bez pokrytí:** ARES/ISIR lookup, ISDS (datové zprávy), SharePoint/Graph,
  samotné doručení e-mailů přes SMTP a notifikační cron, klientský portál
  (magic link přes e-mail), platební/Pohoda exporty. Všechno vyžaduje externí
  integraci. Pozvánky nových uživatelů jsou pokryté až po odeslání: hláška
  adminovi při vypnutém SMTP, „Znovu poslat pozvánku“ a celý průchod odkazem
  `/set-password` (`users-invitations.spec.ts`, token se vkládá přímo do DB).

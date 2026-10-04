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
| `public-pages.spec.ts` | landing, login, registrace, 404, mobilní viewport |
| `auth.spec.ts` | redirecty na `/login`, návrat na původní stránku, chybné přihlášení, odhlášení, ochrana `from` |
| `navigation.spec.ts` | shell, levé menu, `aria-current`, skip-link, ⌘K paleta, mobilní menu |
| `modules.spec.ts` | každý modul: URL + `h1` + klíčová sekce; detaily nad seedovanými ID |
| `roles-and-permissions.spec.ts` | viditelnost v menu, přímé URL na chráněné stránky, sazby, organizační kontext |
| `subjects-flow.spec.ts` | hledání, filtry, vytvoření, validace, diakritika, duplicitní IČO, 404 |
| `tasks-and-worklogs.spec.ts` | úkoly, změna statusu, komentáře, výkazy práce, reporty |
| `responsive-and-accessibility.spec.ts` | 3 viewporty, jediný `h1`, popisky, klávesnice, hlavičky tabulek, screenshoty |

Pomocné funkce jsou v `tests/e2e/support/helpers.ts`.

## Známá omezení

- **Server action bez redirectu neobnoví stránku.** V Next 16.2.9 se u
  `force-dynamic` stránek po server action, která volá jen `revalidatePath()`,
  klientský router nepřekreslí — uživatel změnu uvidí až po ručním obnovení.
  `refresh()` z `next/cache` pomáhá jen na statických cestách (proto je použitý
  v `updateTableViewPreference`); na dynamické cestě `/tasks/[id]` nefunguje a
  `redirect()` na stejnou URL je no-op. Týká se to `updateTaskStatus`,
  `addTaskComment` a `createWorkLog`. Testy proto po odeslání explicitně
  načtou stránku znovu a ověří uložený a vykreslený výsledek.
- **Registrace se v testech nedokončuje** — vyžadovala by SMTP. Ověřuje se jen
  dostupnost a přístupnost formuláře.
- **Bez pokrytí:** ARES/ISIR lookup, ISDS (datové zprávy), SharePoint/Graph,
  odesílání e-mailů a notifikační cron, klientský portál (magic link přes
  e-mail), platební/Pohoda exporty. Všechno vyžaduje externí integraci.

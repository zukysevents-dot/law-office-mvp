# IMPROVEMENTS

Výsledek UX / a11y / konzistenčního auditu aplikace IURIVERSE (Law Office MVP).

**Metoda.** Skriptovaný průchod 41 aplikačních rout ve dvou šířkách (1440 px,
390 px) přihlášený jako administrátor — sbíral HTTP status, chyby v konzoli,
vodorovné přetečení dokumentu, počet `h1`, formulářová pole bez přístupného
názvu, prvky bez přístupného jména a duplicitní `id`. Nálezy pak potvrzeny
ručním průchodem v prohlížeči na 390 / 768 / 1024 / 1440 px.

Sweep nenašel žádnou 4xx/5xx odpověď, žádnou chybu v konzoli a každá stránka
má právě jeden `h1` — základ je zdravý. Níže je to, co skutečně nesedělo.

| # | Problém | Prio | Dopad na uživatele | Provedená oprava | Ověření |
|---|---------|------|--------------------|------------------|---------|
| 1 | Globální hledání (⌘K) šlo otevřít **jen klávesovou zkratkou**. Nikde v UI nebyl viditelný spouštěč, na dotykovém zařízení tedy funkce neexistovala vůbec. | P1 | Vlajková funkce byla pro část uživatelů nedostupná a pro zbytek neobjevitelná. | Viditelné tlačítko „Hledat“ v levém panelu (s odznakem ⌘K) i v mobilní horní liště; paleta poslouchá vlastní událost `iuriverse:open-search`. | E2E: `hledání jde otevřít myší z levého panelu`, `hledání jde otevřít na mobilu z horní lišty` |
| 2 | `/tasks` na mobilu **scrolloval o 358 px do strany**. `.sr-only` popisek uvnitř ikonového tlačítka v `.table-scroll` neměl pozicovaného předka, vzal si za containing block ICB, unikl ořezu kontejneru a roztáhl celý dokument. | P1 | Rozbité rozvržení na telefonu; obsah utíkal mimo obrazovku na každé stránce s ikonovým tlačítkem v tabulce (~30 tabulek). | `.table-scroll { position: relative }` — jeden řádek CSS, který drží absolutně pozicované potomky uvnitř scrolleru. | E2E: `nescrolluje vodorovně` nově přes 9 rout × 3 viewporty (dřív jen `/dashboard` + `/subjects`) |
| 3 | Na 1024–1279 px se v úzké liště zobrazil **oříznutý wordmark** a kompaktní značka měla nulovou šířku — `inline-flex` z `IuriverseLogo` přebilo `hidden` z volajícího. | P1 | Rozbitá hlavička navigace na běžném notebooku. | Přepínač viditelnosti přesunut na obalový `span`; `OrbitMark` dostal `shrink-0`. | E2E: `úzká lišta na 1024 px zobrazí jen kompaktní značku` |
| 4 | Formulářová pole bez přístupného názvu: hledání na `/subjects` a `/conflict-check` (jen placeholder), řádkový výběr statusu + poznámka na `/tasks`, výběr role na `/settings/organization`, vstup příkazové palety. | P2 | Čtečka hlásila „edit text“ / „combo box“ bez kontextu; u hledání chyběl i vizuální popisek. | Hledání dostalo viditelný `<Field label="Hledat">` (konzistentní se sousedním filtrem), ostatní `aria-label` s názvem konkrétního záznamu. | E2E: `formulářové prvky na … mají přístupný název` pro 4 routy, helper `unlabeledFormControls` |
| 5 | Příkazová paleta neměla přístupné jméno dialogu, výsledky se neohlašovaly a používala cizí barevnou škálu (`stone-*`). | P2 | Uživatel čtečky se nedozvěděl, že se dialog otevřel ani že přišly výsledky; vizuální nesoulad se zbytkem aplikace. | `aria-labelledby` + skrytý nadpis „Rychlé hledání“, `role="status" aria-live="polite"` s počtem výsledků, stav „Hledám…“, přebarveno na tokeny `--iv-*`. | Ověřeno v prohlížeči (status hlásí „Nalezeno výsledků: 3“); E2E kontroluje název dialogu |
| 6 | **Povinná pole nebyla nikde vizuálně označená.** | P2 | Uživatel zjistil povinnost až z nativní validace po odeslání. | Jedno pravidlo v `globals.css` s `:has()` označí hvězdičkou popisek každého povinného pole v celé aplikaci — bez propu protaženého stovkami call-sites. AT informaci má už z atributu `required`. | E2E: `povinná pole jsou vizuálně označená hvězdičkou` |
| 7 | Plovoucí stopky (`fixed` vpravo dole) **trvale překrývaly konec obsahu** — poslední řádek tabulky na každé seznamové stránce. | P2 | Poslední záznam nešel na mobilu přečíst ani rozkliknout. | `pb-24` na hlavním kontejneru `AppShell` rezervuje místo pod obsahem. | E2E: `plovoucí stopky nepřekrývají konec obsahu stránky` |
| 8 | `/login` byla **slepá ulička**: žádný odkaz na registraci ani zpět na úvodní stránku. | P2 | Nový uživatel se z přihlášení nedostal dál (opačný směr `/register` → `/login` existoval). | Přidány odkazy „Nemáte účet? Zaregistrujte se“ a „Zpět na úvodní stránku“. | E2E: `z přihlášení vede odkaz na registraci i zpět na úvod` |
| 9 | Chybová hranice nabízela jen „Zkusit znovu“; když reset chybu nevyřešil, uživatel uvízl. Zpráva navíc nebyla ohlášena čtečce a používala `stone-*` barvy. | P2 | Ztracený uživatel bez cesty ven. | Přidán odkaz „Zpět na dashboard“, `role="alert"` na text, barvy sjednoceny s paletou. | Ruční kontrola vykreslení |

## Co bylo prověřeno a je v pořádku

- **Oprávnění a viditelnost dat** — `*VisibilityWhere` helpery a `assertCanEditRecord`
  jsou zapojené konzistentně; sazby a finanční údaje se koncipientovi/praktikantovi
  nezobrazují (pokryto stávající E2E sadou).
- **Registrace / ověření e-mailu / připojení ke kanceláři** — generické odpovědi
  proti enumeraci účtů, jednorázový token pod `FOR UPDATE`, srozumitelné české
  hlášky pro neplatný i expirovaný odkaz, rate-limiting.
- **Návrat na původní stránku po přihlášení** — `safeInternalRedirectPath`
  normalizuje `from` na same-origin cestu (chytá i `/\evil.example`).
- **Dvojité odeslání formuláře** — `Button` používá `useFormStatus` a v průběhu
  akce se sám zakáže.
- **Mobilní menu** — focus trap, Escape, návrat fokusu na spouštěč, `aria-expanded`,
  zamčený scroll pozadí.
- **Odolnost při nedostupné DB** — `safeQuery` + `DatabaseNotice` degradují
  stránky do českého upozornění místo pádu.
- **Skip-link, `aria-current` v navigaci, jeden `h1` na stránku** — funkční.

## Zbývající doporučení (mimo rozsah této opravy)

1. **Titulek stránky se nastavuje až na klientu.** `DocumentTitle` mění
   `document.title` v `useEffect`; do hydratace má záložka obecný titulek.
   Správné řešení je `export const metadata` (případně `generateMetadata`
   u detailů) na ~60 stránkách — mechanická, ale široká změna, kterou je lepší
   udělat samostatně.
2. **Potvrzení uložení není ohlášeno.** Po serverové akci se stránka jen
   překreslí; chybí jednotný „uloženo“ toast/live region. Vyžaduje produktové
   rozhodnutí o vzoru zpětné vazby napříč aplikací.
3. **Filtry na `/tasks` a `/work-logs` nemají reset.** Deset selectů se ručně
   vrací do „vše“ jeden po druhém. Chce to tlačítko „Zrušit filtry“ a rozhodnutí,
   zda se filtry mají ukládat mezi návštěvami.
4. **Hustota KPI karet na mobilu.** Čtyři karty pod sebou vytlačí filtry
   i seznam pod záhyb; dvousloupcové rozvržení by pomohlo, ale delší popisky
   („Čeká na protistranu“) potřebují návrhářské rozhodnutí.
5. **Cílová plocha zaškrtávacích polí** (16 × 16 px) je pod hranicí WCAG 2.2
   AA 2.5.8; popisek je klikatelný, takže dopad je malý, ale sjednocení
   velikosti checkboxů je vhodné při příští revizi designu.

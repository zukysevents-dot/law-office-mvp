# Onboarding kanceláře — co musí zákazník zařídit

> Podklad pro prodej a nasazení. Cíl: **zákazník nemá co kupovat a nikam nežádá.**
> Co jde přesunout na nás, přesuneme na nás. Stav k 2026-09-12.

## Zařizujeme my, jednou pro všechny zákazníky

- server, doména, databáze, zálohy, instalace
- odesílání e-mailů (z naší domény) — zákazník nedává heslo od své pošty
- odkaz na evropský sankční seznam pro AML (registrace u Evropské komise, zdarma, jedna pro celý produkt)
- registrace aplikace u Microsoftu — **jedna multi-tenant aplikace v našem tenantu**,
  client secret držíme my a nikomu ho neposíláme (viz „Co tomu ještě chybí")
- do budoucna smlouva s BankID (smluvním partnerem je provozovatel služby, tedy my)

## Zákazník si odklikne v aplikaci

- **Microsoft 365 / SharePoint** — „Připojit Microsoft 365", jejich admin potvrdí souhlas
  uvnitř Microsoftu a vybere knihovnu na spisy
- **Datová schránka** — každý advokát si svou připojí sám u svého účtu
  (viz [isds-live-integration.md](architecture/isds-live-integration.md))
- fakturační údaje, role uživatelů

## Co zbyde čistě na zákazníkovi

- podpis smlouvy + zpracovatelské smlouvy a mlčenlivosti (bez toho do systému nesmí reálné spisy)
- jeho vlastní AML agenda (vnitřní zásady, pověřená osoba) — aplikace eviduje, rozhoduje advokát
- volitelně certifikát pro datovou schránku, pokud chce místo hesla vyšší zabezpečení

## Co tomu ještě chybí (blokuje prodej dalším kancelářím)

1. **Microsoft integrace je dnes jen z env** ([config.ts](../src/lib/microsoft/config.ts),
   [graph.ts](../src/lib/microsoft/graph.ts)) — `MS_TENANT_ID`, `MS_CLIENT_SECRET` a
   `SHAREPOINT_SITE_URL` platí pro celou instanci a token cache je jedna sdílená proměnná.
   Druhá kancelář na stejné instanci by psala do SharePointu té první. Pro pilot u jedné
   kanceláře to stačí, pro prodej **ne**. Potřeba: multi-tenant app registration,
   admin-consent flow s callbackem, `tenantId` + vybraná knihovna u `Organization`,
   token cache klíčovaná tenantem, oprávnění `Sites.Selected`.
2. **Živé napojení ISDS** — dnes stub, viz
   [isds-live-integration.md](architecture/isds-live-integration.md).
3. **Upload souborů nad 4 MB** ([documents.ts](../src/app/actions/documents.ts)) — simple
   upload přes Graph; nad 4 MB je potřeba upload session. Sken spisu dnes neprojde.

## Co zákazníkovi říct dopředu, ať není překvapený

- datová schránka se zatím nenapojí naživo, zprávy se zadávají ručně
- soubory nad 4 MB se zatím nenahrají
- účetní export faktur (ISDOC/Pohoda) není
- přihlášení přes Microsoft / BankID / e-podpis není
- k souborům v SharePointu hlídá přístup SharePoint, ne my — naše role řeší, kdo vidí
  záznam o dokumentu, ale kdo klikne na odkaz, narazí na oprávnění knihovny

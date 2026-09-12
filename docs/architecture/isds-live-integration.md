# Živé napojení datových schránek (ISDS) — rozhodnutí a návrh

> Status: **rozhodnuto 2026-09-12, neimplementováno.** Dnes běží [stub klient](../../src/lib/isds/client.ts)
> (`ISDS_ENABLED=false`) — modul `DATA_BOXES` umí jen ruční evidenci zpráv.
> Navazuje na rozhodnutí z porady 2026-06-29 (oficiální ISDS rozhraní, ne partner à la EXevido)
> a uzavírá otevřenou otázku „⚖️ vyřešit s právníky" v [ROADMAP §7](../ROADMAP.md).

## Kontext

V advokátní kanceláři nestačí jedna schránka na organizaci. Reálný stav:

- kancelář má **společnou** datovou schránku (s.r.o. / sdružení),
- **každý advokát má navíc svou osobní** schránku jako advokát — a soudy doručují
  právě tam, protože zástupcem je konkrétní advokát, ne firma.

Dnešní model `DataBoxAccount` je org-scoped (`@@unique([organizationId, boxId])`),
víc schránek na organizaci tedy unese, ale **nemá vlastníka** a `DataMessage` je
viditelná celé organizaci. Na osobní schránku to nesedí — chodí do ní i věci,
do kterých kanceláři nic není.

## Rozhodnutí

**1. Připojení je samoobslužné a per uživatel.**
Advokát si svou schránku připojí sám ve svém účtu, nejde to přes admina.
Kdo má víc schránek, připojí jich víc. Firemní schránku připojuje ten, kdo ji spravuje.

**2. Výchozí ověření je jméno + heslo, certifikát je volitelný.**
Certifikát je bezpečnější, ale znamená nákup (~880 Kč/rok PostSignum „komerční serverový",
~1 289 Kč/rok I.CA „komerční technologický") **a osobní návštěvu registrační autority**.
Jako povinný krok onboardingu by to zabíjelo prodej — nová kancelář musí být schopná
připojit datovku za dvě minuty a zdarma. Certifikát nabízíme těm, kdo si o něj řeknou
(velké kanceláře, vyšší bezpečnostní nároky).

Důsledek, který musí být ošetřený a řečený nahlas: **heslo k datové schránce leží u nás**
(šifrovaně, `credentialsEncrypted` + `DATA_ENCRYPTION_KEY`). Podmínkou je šifrování at-rest,
přístup jen pro vlastníka schránky a audit každého použití.

**3. Údaje se ukládají — připojení je trvalé, ne „přihlášení na klik".**
Zprávy se musí stahovat i když u toho uživatel není (v noci, o víkendu), jinak nefunguje
hlídání lhůt. Varianta „zadám údaje při každém použití" dává jen ruční nahlížení,
což už advokát zdarma má na webu datovky.

**4. Viditelnost zpráv se řídí vlastníkem schránky.**

| Schránka | Kdo vidí zprávy |
|---|---|
| Firemní | podle běžných rolí a práv ke spisům |
| Osobní (advokátova) | **napřed jen její vlastník** |

Osobní zpráva se zpřístupní týmu až tím, že ji advokát **přiřadí ke spisu** — tím ji
vědomě pustí dál. Bez toho ji nevidí ani ADMIN/PARTNER.

## Dopad na model a kód

- `DataBoxAccount`: přidat `ownerUserId` (null = firemní schránka), `authMethod`
  (`PASSWORD` | `CERTIFICATE`), `credentialsExpiresAt` pro hlídání expirace.
- `DataMessage`: viditelnost odvodit od schránky, ne jen od `organizationId` —
  nový `dataMessageVisibilityWhere(user)` v `src/lib/permissions.ts`
  (osobní schránka → jen vlastník; přiřazení ke spisu → tým spisu).
- Reálný klient za stávající feature-hranicí `getIsdsClient()` — SOAP + mTLS,
  stahování, přílohy, doručenky, odesílání; vývoj proti oficiálnímu testovacímu
  prostředí (czebox), přepnutí na produkci jen konfigurací.
- **Hlídání expirace:** certifikát platí rok a heslo ISDS vyžaduje pravidelnou změnu
  (ověřit, zda a jak lze nastavit trvalé heslo). Když vyprší, stahování tiše ustane
  a advokát si bude myslet, že nic nepřišlo — u běžících lhůt nejhorší možná chyba.
  Notifikace s předstihem je proto **součást zadání, ne vylepšení**.

## Náklady pro zákazníka

Nula, pokud jede na heslo. S certifikátem ~900–1 300 Kč ročně **na každou připojenou
schránku** — kancelář se čtyřmi advokáty tedy firemní + čtyři osobní, zhruba 6 500 Kč/rok.
Certifikát je vždy vydaný na majitele schránky; jedním naším certifikátem to za zákazníky
řešit nelze a ani nechceme.

## Zůstává otevřené

- **Odesílání zpráv jménem advokáta** — právně citlivější než stahování, mění rozsah.
  Potvrdit s advokáty, jestli má appka jen přijímat, nebo i odesílat.
- Zda a jak lze v ISDS nastavit trvalé heslo (odpadl by hlavní praktický argument
  proti heslové variantě).

# ROADMAP.md — `law-office-mvp`

> Modulární právní SaaS, **SingleCase-first**. Tento dokument je závazná architektonická roadmapa od produktizace po HR/docházku. Jádro (subjekty, spisy, úkoly, výkazy, reporty) je z velké části hotové; níže je rozpad toho, co chybí k paritě, a v jakém pořadí to stavět a prodávat.
>
> _Vznik: návrh agenta `solution-architect` (naše multi-agent pipeline), 2026-06-25. Referenční produkty: SingleCase (primární), Praetor, MarkTime, Alveno (HR doména)._

---

## 1. Cílová vize

`law-office-mvp` je modulární SaaS pro správu advokátní kanceláře, který funkčně dohání zavedené české systémy — primárně **SingleCase**, dále **Praetor**, **MarkTime** a (HR doména) **Alveno**. Jádro (subjekty, spisy/kauzy, úkoly, výkazy práce, reporty, konflikt-check, ARES) už stojí na multi-tenant základu s org-scoped autorizací a auditní stopou. Produkt se prodává po **modulech**, které si organizace zapíná zvlášť (fakturace, datové schránky, AML, lhůtník, dokumenty+šablony, klientský portál, HR/docházka). Software-only přístup: žádný hardware (biometrické terminály), jen importy a integrace na existující státní/účetní rozhraní. Prioritou je **transakční integrita financí a lhůt**, **izolace dat mezi kancelářemi** a **dodržení zákonných povinností** (advokátní mlčenlivost, AML, datové schránky, archivace).

---

## 2. Epik 0 (PRVNÍ): Architektura produktizace / entitlements

Bez tohoto epiku nelze žádný modul prodávat odděleně. Aktuálně `Organization` zná jen `seatLimit` a `status` — nemá pojem „který modul je koupený". Tohle musí být první, protože **každý další epik na něj věší svůj `MODULE_KEY` guard**.

### 2.1 Pozorování ze stávajícího kódu (na čem stavíme)

- `getCurrentUser()` v `src/lib/auth.ts` je **jediná brána** pro všechny `(app)` routy — vrací usera s `organizationId` a org-scoped `role`. Sem (resp. do navazujícího helperu) patří entitlement check.
- Autorizace je deklarativní: `assert*` funkce + `*VisibilityWhere` v `src/lib/permissions.ts`. Entitlement bude **ortogonální vrstva** vedle role-permissions: nejdřív „má org modul?", až pak „smí tento uživatel?".
- Server actions mají ustálený vzor: `getCurrentUser()` → `assert*` → `canViewRecord` → DB → `auditLog` → `revalidatePath`. Guard modulu se vkládá hned za `getCurrentUser()`.
- Session je stateless signed cookie (`src/lib/session.ts`), běží i v edge middleware — můžeme dělat levný hrubý guard i v `middleware.ts`, ale **autoritativní check musí být v RSC/action vrstvě** (middleware nezná org membership bez DB).

### 2.2 Datový model — nové Prisma modely a enumy

```prisma
enum ModuleKey {
  CORE              // vždy zapnuto, neprodává se zvlášť
  BILLING
  DATA_BOXES        // datové schránky / ISDS
  AML
  DEADLINES         // lhůtník
  DOCUMENTS         // DMS + šablony
  CLIENT_PORTAL
  HR_ATTENDANCE
}

enum ModuleStatus {
  ENABLED
  DISABLED
  TRIAL
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}

enum PlanInterval {
  MONTHLY
  YEARLY
}

model Module {                       // katalog (seedovaný, read-mostly)
  key          ModuleKey  @id
  name         String
  description  String?
  // závislosti mezi moduly (CLIENT_PORTAL vyžaduje DOCUMENTS apod.)
  requiresKeys ModuleKey[]
  isCore       Boolean    @default(false)
  active       Boolean    @default(true)
}

model OrganizationModule {           // entitlement per org
  id             String       @id @default(cuid())
  organizationId String
  moduleKey      ModuleKey
  status         ModuleStatus @default(DISABLED)
  trialEndsAt    DateTime?
  enabledAt      DateTime?
  disabledAt     DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, moduleKey])
  @@index([organizationId])
}

model Plan {                         // ceník (seedovaný)
  id           String       @id @default(cuid())
  name         String
  includedKeys ModuleKey[]
  priceCzk     Decimal      @db.Decimal(12, 2)
  interval     PlanInterval @default(MONTHLY)
  active       Boolean      @default(true)
}

model Subscription {                 // předplatné org
  id              String             @id @default(cuid())
  organizationId  String
  planId          String?
  status          SubscriptionStatus @default(TRIALING)
  currentPeriodEnd DateTime?
  externalRef     String?            // Stripe subscription id apod.
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plan         Plan?        @relation(fields: [planId], references: [id], onDelete: SetNull)

  @@unique([organizationId])         // 1 aktivní subscription / org (MVP)
  @@index([organizationId])
}
```

Rozhodnutí: fakturace **předplatného produktu** (Subscription) je oddělená od **fakturace klientům kanceláře** (Epik 1). Nemíchat — jiné DPH, jiný plátce, jiná doména.

### 2.3 Server-side vynucení (kde přesně je guard)

- **Nový helper** `src/lib/entitlements.ts`:
  - `getEnabledModules(organizationId): Promise<Set<ModuleKey>>` — cachovaný per request (React `cache()`).
  - `isModuleEnabled(orgId, key)` a `assertModuleEnabled(user, key)` (vyhodí, fail-closed; `CORE` vždy true).
- **RSC stránky modulu:** každá `page.tsx` v daném modulu volá `assertModuleEnabled(currentUser, MODULE_KEY)` hned po `getCurrentUser()`. Bez modulu → `notFound()` / redirect na „modul není aktivní".
- **Server actions:** první řádek po `getCurrentUser()` je `assertModuleEnabled(...)`. Toto je autoritativní hranice — i kdyby UI prosáklo, action selže.
- **Route handlery (`route.ts` exporty):** stejný guard.
- **`middleware.ts` (volitelně, hrubý filtr):** rychlé odmítnutí cest disabled modulu podle prefixu pro lepší UX; **nikdy ne jako jediná ochrana** (middleware nemá spolehlivě org membership).
- **Menu / navigace:** `AppShell` dostane `enabledModules` a položky disabled modulů skryje — ale to je jen UX, ne bezpečnost.

### 2.4 Feature-flag strategie

- Entitlement (koupený modul) ≠ feature flag (rozpracovaná funkce). Drž je oddělené: entitlement v DB (`OrganizationModule`), dev/rollout flagy přes ENV nebo prostý `flags.ts` konstanty. Nepřetěžovat entitlement systém experimentálními flagy.
- TRIAL stav: `ModuleStatus.TRIAL` + `trialEndsAt`; guard počítá TRIAL jako ENABLED dokud nevyprší (kontrola při čtení, plus nightly job na přepnutí na DISABLED).

### 2.5 Úkoly (pořadí + závislosti)

- [ ] E0-1 Prisma: přidat `ModuleKey`/`ModuleStatus`/`SubscriptionStatus`/`PlanInterval` enumy + modely `Module`, `OrganizationModule`, `Plan`, `Subscription`; migrace + relace na `Organization`.
- [ ] E0-2 Seed katalogu modulů a základních plánů (`prisma/seed.ts`).
- [ ] E0-3 `src/lib/entitlements.ts`: `getEnabledModules` (request-cached), `isModuleEnabled`, `assertModuleEnabled` (závisí na E0-1).
- [ ] E0-4 Unit testy entitlements (fail-closed, CORE vždy, TRIAL expiry, `requiresKeys` závislosti) — vzor dle `permissions.test.ts`.
- [ ] E0-5 `AppShell`: skrývání menu položek dle `enabledModules` (čistě UX).
- [ ] E0-6 `/settings/organization`: read-only přehled aktivních modulů a stavu předplatného (závisí na E0-1).
- [ ] E0-7 `/admin`: platform-admin zapíná/vypíná moduly org (`OrganizationModule` CRUD) + audit; respektovat `requiresKeys`.
- [ ] E0-8 (volitelně) `middleware.ts` hrubý prefix-guard pro disabled moduly (UX, závisí na E0-3).
- [ ] E0-9 Integrace platby předplatného (Stripe) — **až po MVP modulů**; teď jen `externalRef` placeholder a manuální zapínání z `/admin`.

---

## 3. Moduly — rozpad na epiky

> Každý modul = jeden `ModuleKey`. Pořadí epiků níže = doporučené pořadí stavby/prodeje (viz fáze v sekci 4). Pro každý: cíl, referenční pokrytí, nové modely/pole, klíčové routy/akce, integrace/rizika, checklist.

### 3.1 Epik 1 — Fakturace klientům (`BILLING`)

**Cíl:** Z dnešního „výběr + schválení výkazů + export" udělat **skutečnou fakturaci**: vystavení faktury (číselná řada, DPH/neplátce, paušály, splátky), PDF faktura + průvodní dopis + podrobná příloha výkonů, evidence úhrad a upomínek.
**Reference:** MarkTime (fakturace z výkazů), SingleCase (faktura + příloha výkonů + paušály).

**Pozor — kde dnes „billing" končí:** modul `billing` je jen `approvalStatus` workflow nad `WorkLog` + export CSV/XLSX. Nezasahovat do schvalování; nový kód staví **nad** schválené (`APPROVED`) výkazy.

**Nové modely/pole:**
- `Invoice` (organizationId, subjectId=odběratel, projectId/caseId nullable, číselná řada `number`, `variableSymbol`, `issueDate`, `dueDate`, `taxDate`, `status` DRAFT/ISSUED/SENT/PARTIALLY_PAID/PAID/CANCELLED, `currency`, `subtotalCzk`, `vatCzk`, `totalCzk`, `vatMode` PAYER/NON_PAYER, `note`, `pdfUrl`).
- `InvoiceLine` (invoiceId, `description`, `quantity`, `unit`, `unitPriceCzk`, `vatRate`, `amountCzk`, nullable `workLogId` pro dohledatelnost na výkaz).
- `InvoiceNumberSequence` (organizationId, `year`, `prefix`, `lastNumber`) — **unikátní per org+rok**, číslo se přiděluje v DB transakci (analogie seat-limit zámku).
- `Payment` (invoiceId, `paidAt`, `amountCzk`, `method`, `note`).
- `Reminder` (invoiceId, `level` 1/2/3, `sentAt`, `channel`).
- `RetainerAgreement` (paušál: subjectId, `monthlyFeeCzk`, `includedHours?`, platnost) — generuje pravidelné faktury.
- enumy: `InvoiceStatus`, `VatMode`, `PaymentMethod`.

**Klíčové routy/akce:** `/billing/invoices` (list), `/billing/invoices/new` (z vybraných APPROVED work-logů → návrh řádků), `/billing/invoices/[id]` (detail, vystavit, stornovat), `/billing/invoices/[id]/pdf` (route.ts → PDF), `/billing/payments`, akce `issueInvoice` (transakce: přidělí číslo + zamkne výkazy), `recordPayment`, `sendReminder`.

**Integrace/rizika:**
- **Číslování faktur:** musí být gap-free a unikátní per org/rok → **transakce + řádkový zámek** na `InvoiceNumberSequence`. Critical: žádné dvě faktury se stejným číslem (v sesterském Vystaveno už řešili „duplicitní čísla faktur" — poučit se).
- **DPH vs neplátce:** neplátce → `vatMode` musí umět nulovou DPH a správný text na faktuře.
- **PDF:** Chrome headless (jako Vystaveno) nebo serverový renderer; pozor na fonty/diakritiku.
- **Účetní export** (ISDOC/Pohoda/Money) — fáze 2 modulu.

**Úkoly:**
- [ ] B-1 Prisma modely + enumy + migrace (`Invoice`, `InvoiceLine`, `InvoiceNumberSequence`, `Payment`, `Reminder`, `RetainerAgreement`).
- [ ] B-2 `assertModuleEnabled(BILLING)` guard na všech billing/invoice routách a akcích (závisí E0-3).
- [ ] B-3 Transakční přidělení čísla faktury (zámek na sequence) + unit test na souběh (Critical).
- [ ] B-4 Akce „vytvoř fakturu z vybraných APPROVED work-logů" → předvyplněné `InvoiceLine` + zpětná vazba `workLogId`.
- [ ] B-5 DPH/neplátce výpočet (`subtotal`/`vat`/`total`) + unit testy.
- [ ] B-6 PDF: faktura + průvodní dopis + příloha výkonů (Chrome headless).
- [ ] B-7 Evidence úhrad (`Payment`) + přepočet stavu faktury (PARTIALLY_PAID/PAID).
- [ ] B-8 Upomínky (`Reminder`) + manuální odeslání e-mailem (využít stávající notif. infra).
- [ ] B-9 Paušály (`RetainerAgreement`) + generování pravidelné faktury (manuální trigger MVP).
- [ ] B-10 AuditLog na issue/cancel/payment; `revalidatePath`.

### 3.2 Epik 2 — Datové schránky / ISDS (`DATA_BOXES`)

**Cíl:** Příjem, odeslání a **přiřazení datových zpráv ke spisu**. Zákonná povinnost advokátů.
**Reference:** SingleCase (řeší přes partnera EXevido).

**Nové modely/pole:** `DataMessage` (organizationId, `direction` IN/OUT, `dmId` ISDS message id, `senderBoxId`/`recipientBoxId`, `subject`, `deliveredAt`, `acceptedAt`, `status`, `caseId?`, `subjectId?`, `attachmentUrl?`), `DataBoxAccount` (org credentials/ref, **šifrované**), enum `DataMessageDirection`/`DataMessageStatus`.

**Klíčové routy/akce:** `/data-boxes` (inbox/outbox), `/data-boxes/[id]` (detail + příloha), akce `assignToCase`, `downloadAttachment`, `sendMessage`.

**Integrace/rizika (Critical):**
- ISDS přístup přes oficiální rozhraní nebo přes partnera (EXevido-styl). **Přihlašovací údaje k DS = vysoce citlivá data** → šifrování at-rest, přístup jen role ADMIN/PARTNER, audit každého přístupu.
- Doručenky a lhůty: datum doručení DS spouští procesní lhůty → návaznost na Epik 4 (Lhůtník).
- Právní/legislativní riziko: nesprávné nakládání s DS má následky → odložit za fakturaci, ale před AML klidně.

**Úkoly:**
- [ ] D-1 Prisma modely + enumy + migrace; `DataBoxAccount` s šifrovaným polem.
- [ ] D-2 Guard `assertModuleEnabled(DATA_BOXES)` + role-omezení (jen ADMIN/PARTNER konfiguruje účet).
- [ ] D-3 Klient k ISDS (oficiální API nebo partner) za feature-hranicí (jako dnešní ARES/SharePoint).
- [ ] D-4 Inbox sync (manuální „načíst nové" MVP) + ukládání zpráv s dedupe na `dmId`.
- [ ] D-5 Přiřazení zprávy ke `Case`/`Subject` + audit.
- [ ] D-6 Odeslání zprávy + uložení doručenky.
- [ ] D-7 Stažení/uložení příloh (návaznost na DMS, zatím odkaz/blob).
- [ ] D-8 Hook na vznik procesní lhůty z doručení (připravit rozhraní pro Epik 4).

### 3.3 Epik 3 — AML (`AML`)

**Cíl:** Identifikace klienta, hodnocení rizik, evidence — zákonná povinnost (AML zákon). Dnes jen `riskFlag` boolean.
**Reference:** SingleCase/Praetor (AML evidence).

**Nové modely/pole:** `AmlAssessment` (subjectId, `riskLevel` LOW/MEDIUM/HIGH, `assessedById`, `assessedAt`, `politicallyExposed` bool, `sanctionsChecked` bool, `note`, `reviewDueAt`), `AmlIdentification` (subjectId, `documentType`, `documentNumber` **šifrovaně**, `verifiedAt`, `method`), enum `AmlRiskLevel`. Zachovat `Subject.riskFlag` jako odvozený rychlý příznak.

**Klíčové routy/akce:** sekce v `/subjects/[id]` + `/aml` (přehled rizik, blížící se revize), akce `recordIdentification`, `assessRisk`.

**Integrace/rizika:** osobní doklady = citlivá data → šifrování, audit, přístup jen oprávněným rolím. Sankční seznamy / PEP kontrola — MVP manuální checkbox, automatizace později.

**Úkoly:**
- [ ] A-1 Prisma modely + enum + migrace; šifrované pole pro číslo dokladu.
- [ ] A-2 Guard `assertModuleEnabled(AML)`.
- [ ] A-3 Formulář identifikace klienta + evidence (`AmlIdentification`).
- [ ] A-4 Hodnocení rizik (`AmlAssessment`) + propsání do `Subject.riskFlag`.
- [ ] A-5 Přehled `/aml`: rizikoví klienti + blížící se revize (`reviewDueAt`).
- [ ] A-6 Audit a omezení přístupu k AML datům dle role.

### 3.4 Epik 4 — Lhůtník (`DEADLINES`)

**Cíl:** Procesní lhůty, soudní kalendář, hlídání. Dnes jen `task.deadline`.
**Reference:** SingleCase (timeline + lhůty), Praetor.

**Nové modely/pole:** `Deadline` (organizationId, caseId, `type` PROCEDURAL/COURT/INTERNAL, `title`, `dueDate`, `originEvent` např. doručení DS, `originDate`, `computedRule`, `status`, `responsibleUserId`, `completedAt`), `CourtHearing` (caseId, `court`, `hearingAt`, `room`, `note`). Enum `DeadlineType`/`DeadlineStatus`.

**Klíčové routy/akce:** `/deadlines` (přehled, blížící se), integrace do `/calendar`, akce `createDeadline`, `completeDeadline`. Návaznost: doručení DS (Epik 2) → návrh lhůty.

**Integrace/rizika:** zmeškaná lhůta = škoda/odpovědnost advokáta → notifikace (využít stávající `Notification` infra, přidat typy `DEADLINE_*`), redundantní upozornění. Výpočet lhůt dle procesních pravidel — MVP manuální/jednoduchá pravidla, ne automatický právní výpočet.

**Úkoly:**
- [ ] L-1 Prisma modely + enumy + migrace.
- [ ] L-2 Guard `assertModuleEnabled(DEADLINES)`.
- [ ] L-3 CRUD lhůt na spisu + přehled `/deadlines`.
- [ ] L-4 Soudní jednání (`CourtHearing`) + zobrazení v `/calendar`.
- [ ] L-5 Notifikace o blížící se lhůtě (rozšířit `NotificationType`).
- [ ] L-6 Hook: doručení DS → návrh procesní lhůty (závisí D-8).

### 3.5 Epik 5 — Dokumenty + chytré šablony (`DOCUMENTS`)

**Cíl:** Vlastní DMS s verzováním, generování dokumentů ze šablon s předvyplněním klient/protistrana/spis, fulltext. Dnes jen odkaz na SharePoint.
**Reference:** SingleCase (DMS + šablony), Praetor.

**Nové modely/pole:** `Document` (organizationId, caseId?/subjectId?, `name`, `mimeType`, `storageUrl`, `currentVersionId`), `DocumentVersion` (documentId, `version`, `storageUrl`, `uploadedById`, `uploadedAt`, `checksum`), `DocumentTemplate` (organizationId, `name`, `bodyTemplate`, `placeholders` JSON), enum dokumentových typů. Fulltext přes Postgres `tsvector` index.

**Klíčové routy/akce:** `/documents`, `/documents/templates`, akce `uploadVersion`, `generateFromTemplate` (předvyplní subjekt/spis), `searchDocuments`.

**Integrace/rizika:** úložiště — buď SharePoint (už máme hranice/URL pole) nebo blob storage; **rozhodnout jednou** a nemíchat. Mlčenlivost → přístup dle role + org izolace. E-podpis = samostatné legislativní riziko, odložit.

**Úkoly:**
- [ ] DOC-1 Prisma modely + migrace + fulltext index.
- [ ] DOC-2 Guard `assertModuleEnabled(DOCUMENTS)`.
- [ ] DOC-3 Upload + verzování dokumentu na spisu.
- [ ] DOC-4 Šablony + generování s předvyplněním (subjekt/protistrana/spis).
- [ ] DOC-5 Fulltext hledání.
- [ ] DOC-6 Rozhodnout úložiště (SharePoint vs blob) — ADR; navázat na existující `microsoft/sharepoint.ts`.

### 3.6 Epik 6 — Klientský portál (`CLIENT_PORTAL`)

**Cíl:** Sdílení dokumentů a stavu spisu s klientem.
**Reference:** SingleCase (klientský přístup).
**Závislost:** vyžaduje `DOCUMENTS` (`Module.requiresKeys`).

**Nové modely/pole:** `PortalAccess` (subjectId, `email`, `tokenHash`, `expiresAt`, `scope`), `PortalShare` (documentId/caseId, `sharedById`, `sharedAt`). Samostatný login flow mimo `(app)` (klient ≠ člen org).

**Integrace/rizika (Critical):** klient vidí **jen** explicitně sdílené záznamy → izolace musí být ještě přísnější než org-scope; žádný přístup do interní vrstvy. Auth oddělený od interních sessions.

**Úkoly:**
- [ ] CP-1 Prisma modely + migrace (`PortalAccess`, `PortalShare`).
- [ ] CP-2 Guard `assertModuleEnabled(CLIENT_PORTAL)` + závislost na DOCUMENTS.
- [ ] CP-3 Oddělený klientský auth (token, magic link), mimo org membership.
- [ ] CP-4 Sdílení dokumentu/stavu spisu klientovi (whitelist, ne blacklist).
- [ ] CP-5 Klientské rozhraní (read-only) + audit přístupů.

### 3.7 Epik 7 — HR / Docházka (`HR_ATTENDANCE`) — JINÁ doména

**Cíl:** Zaměstnanci, směny, fond prac. doby, přesčasy, home office, dovolená + saldo, žádosti/schvalování absencí, export do mzdových programů. **Software-only** (žádné terminály/hardware).
**Reference:** Alveno (HR/docházka).

**Nové modely/pole:** `Employee` (org, vazba na User?), `WorkSchedule`/`Shift`, `AttendanceRecord` (in/out, zdroj manuální/import), `AbsenceRequest` (typ DOVOLENÁ/NEMOC/HOME_OFFICE, stav schválení), `LeaveBalance` (saldo dovolené), enumy absencí. Doména **oddělená** od právní části — vlastní `module` namespace, neplést do spisové logiky.

**Klíčové routy/akce:** `/hr/employees`, `/hr/attendance`, `/hr/absences` (žádost/schválení), `/hr/exports` (mzdy: Pamica…), akce `requestAbsence`, `approveAbsence`, `exportPayroll`.

**Integrace/rizika:** mzdový export (Pamica) — formát; bez hardwaru jen import/manuál. Schvalovací workflow podobné billing approvals (znovupoužít vzor). Saldo dovolené = výpočet, hlídat konzistenci v transakci.

**Úkoly:**
- [ ] HR-1 Prisma modely + enumy + migrace (oddělený namespace).
- [ ] HR-2 Guard `assertModuleEnabled(HR_ATTENDANCE)`.
- [ ] HR-3 Evidence zaměstnanců + úvazek/fond prac. doby.
- [ ] HR-4 Docházka (manuální + import), přesčasy.
- [ ] HR-5 Absence: žádost → schválení (workflow vzor z billing).
- [ ] HR-6 Saldo dovolené (transakční přepočet) + unit testy.
- [ ] HR-7 Export pro mzdy (Pamica).

---

## 4. Sekvenování do fází (F0–F8)

Pořadí podle závislostí a podle toho, za co zákazníci zaplatí nejdřív (Fakturace → DS → AML → Lhůtník → Dokumenty → Portál → HR). Jádro bereme jako hotové.

| Fáze | Obsah | Závislost | Proč tady |
|------|-------|-----------|-----------|
| **F0** | Epik 0 — produktizace/entitlements | žádná | Bez toho nelze nic prodat odděleně; všechny moduly na něm visí. |
| **F1** | Epik 1 — Fakturace (`BILLING`) | F0 | Nejvyšší ochota platit; navazuje na hotové výkazy. |
| **F2** | Epik 2 — Datové schránky (`DATA_BOXES`) | F0 | Zákonná povinnost, vysoká hodnota; připraví lhůty. |
| **F3** | Epik 3 — AML (`AML`) | F0 | Zákonná povinnost, malý rozsah, rychlá výhra. |
| **F4** | Epik 4 — Lhůtník (`DEADLINES`) | F0, (F2 pro DS-hook) | Vysoká hodnota; těží z doručenek DS. |
| **F5** | Epik 5 — Dokumenty + šablony (`DOCUMENTS`) | F0 | Větší rozsah; předpoklad pro portál. |
| **F6** | Epik 6 — Klientský portál (`CLIENT_PORTAL`) | F0, **F5** | Vyžaduje DMS. |
| **F7** | Epik 7 — HR/Docházka (`HR_ATTENDANCE`) | F0 | Jiná doména; nezávislé, prodejné zvlášť. |
| **F8** | Produktizace v2 — Stripe/ČR fakturace předplatného, trialy, self-service zapínání modulů | F0–F7 | Až jsou moduly hotové a je co prodávat. |

---

## 5. Vedení fází agenty z pipeline

Default routing (z `CLAUDE.md`): nový feature → `solution-architect` → implementace → `qa-tester` → `invoice-code-reviewer`; bug → `debugger`; UI/a11y → `a11y-specialist`.

- **F0 (entitlements):** `solution-architect` (datový model + kde sedí guard — kritické) → implementace → `qa-tester` (testy fail-closed/izolace) → `invoice-code-reviewer` (autorizační hranice). **Zvýšená pozornost reviewera** — chyba zde prosákne do všech modulů.
- **F1 (fakturace):** `solution-architect` (číselné řady, DPH, transakce) → implementace → `qa-tester` (souběh čísel, DPH okrajáky) → `invoice-code-reviewer`. Pojmenovaný reviewer „invoice" je tu doma. Při bugu s duplicitními čísly → `debugger`.
- **F2 (DS):** `solution-architect` (šifrování credentials, hranice integrace) → implementace → `qa-tester` → `invoice-code-reviewer` (citlivá data, audit).
- **F3 (AML):** `solution-architect` → implementace → `qa-tester` → `invoice-code-reviewer` (přístup k dokladům, šifrování).
- **F4 (lhůtník):** `solution-architect` → implementace → `qa-tester` (notifikace, hraniční data) → `invoice-code-reviewer`.
- **F5 (dokumenty):** `solution-architect` (ADR úložiště) → implementace → `qa-tester` → `invoice-code-reviewer`; UI náročné → `a11y-specialist`.
- **F6 (portál):** `solution-architect` (oddělený auth, whitelist sdílení — kritické) → implementace → `qa-tester` (únik mimo sdílené) → `invoice-code-reviewer`; klientské UI → `a11y-specialist`.
- **F7 (HR):** `solution-architect` (oddělená doména, saldo v transakci) → implementace → `qa-tester` → `invoice-code-reviewer`.
- **F8 (Stripe):** `solution-architect` (webhooky, idempotence plateb) → implementace → `qa-tester` → `invoice-code-reviewer`.

Pravidlo: každá fáze končí zeleným `build` (vč. typecheck) + `lint` + testy, než se předá dál.

---

## 6. Rizika a tradeoffy

- **Údržba modulů:** každý modul = nová doména, migrace, testy a guard. `requiresKeys` závislosti (portál→dokumenty) musí být vynucené, jinak vznikne nekonzistentní entitlement stav. Tradeoff: víc modulů = víc prodejních SKU, ale exponenciálně víc kombinací k otestování. **Mitigace:** jeden sdílený guard helper, ne ad-hoc kontroly.
- **Legislativa (Critical doména):** DS, AML, e-podpis, archivace, mzdy — chyba má právní/finanční následky. Nedělat „automatický právní výpočet lhůt" ani „automatickou AML kvalifikaci" — software eviduje a hlídá, **rozhoduje advokát**. E-podpis a sankční/PEP automatizaci vědomě odkládáme.
- **Citlivá data:** DS credentials, AML doklady, dokumenty pod mlčenlivostí → šifrování at-rest, audit přístupu, přístup dle role. Org izolace už je v `permissions.ts`; nové entity ji **musí** dodržet (`organizationId` + `*VisibilityWhere`).
- **Transakční integrita:** čísla faktur, saldo dovolené, seat/entitlement změny — vždy v DB transakci s vhodným zámkem (vzor: existující seat-limit join). Toto je nepřekročitelné.
- **Fokus / scope creep:** lákadlo dělat moduly paralelně. Doporučení: stavět **sériově po fázích**, prodávat hotové, zpětná vazba z trhu řídí prioritu dalšího modulu. Nejdřív dotáhnout F0+F1 do prodejného stavu, než se otevře F2.
- **Produktizace předplatného (F8) vs MVP:** vědomě odkládáme Stripe/self-service za hotové moduly; do té doby zapíná moduly platform-admin z `/admin` manuálně. Tradeoff: pomalejší onboarding, ale žádná předčasná platební komplexita.

---

## 7. Otevřené otázky / rozhodnutí k potvrzení před stavbou

- [ ] **Předplatné:** Stripe vs česká fakturace předplatného? A vůbec self-service onboarding, nebo napořád manuální zapínání z `/admin`? (ovlivní F0-9 a F8)
- [ ] **Úložiště dokumentů:** SharePoint (už máme hranice) vs blob storage? Rozcestník pro celý Epik 5/6 (DOC-6 ADR).
- [ ] **Datové schránky:** oficiální ISDS API vs partner à la EXevido? Ovlivní rozsah a riziko Epiku 2.

---

### Klíčové soubory pro implementaci

- Entitlement brána a vzor autorizace: `src/lib/auth.ts` (`getCurrentUser`), `src/lib/permissions.ts` (vzor `assert*`/`*VisibilityWhere`), nový `src/lib/entitlements.ts`.
- Session/edge: `src/lib/session.ts` (případný `src/middleware.ts`).
- Vzor server action (guard → assert → DB → audit → revalidate): `src/app/actions/billing.ts`.
- Datový model: `prisma/schema.prisma`, seed `prisma/seed.ts`.
- Shell/menu pro skrývání modulů: `src/components/app-shell.tsx` (přes `(app)/layout.tsx`).

# Nasazení do produkce — Supabase + Vercel

`syndikat.legal` (`law-office-mvp`) je Next.js 16 / Prisma 7 aplikace. Pro
produkci slouží **Supabase jako managed PostgreSQL** a **Vercel jako hosting**.

**Architektura, kterou je dobré znát před čtením:**

- **Prisma je jediný ORM.** Veškerý přístup k DB jde server-side přes Prisma
  (`@prisma/adapter-pg`). Aplikace **nepoužívá** Supabase JS klient, Supabase
  Auth ani Supabase Storage. Supabase je tu čistě hostovaný Postgres.
- **Autentizace je vlastní a produkční** — per-user heslo (scrypt) + podepsaná
  cookie (HMAC). Žádné Supabase Auth se nenastavuje.
- **Žádné uploady souborů** → žádný Storage bucket se nezakládá.

---

## 1. Vytvoření Supabase projektu

1. [supabase.com](https://supabase.com) → **New project**.
2. Zvol **silné databázové heslo** (ulož do password manageru — budeš ho
   potřebovat v connection stringu).
3. Region zvol nejblíž uživatelům (např. `eu-central-1` / Frankfurt).
4. Doporučení: **oddělené projekty pro development a production** (viz bod 10).

## 2. Kde najít přístupové údaje

V Supabase dashboardu projektu:

| Údaj | Kde |
|------|-----|
| **Project URL** | Settings → API → *Project URL* (pro `NEXT_PUBLIC_SUPABASE_URL`, jen kdyby se přidal Storage/Auth — dnes nepotřeba) |
| **anon key** | Settings → API → *Project API keys → anon public* (dnes nepoužito) |
| **Connection string (pooled)** | **Connect** (tlačítko nahoře) → *ORMs → Prisma* → hodnota `DATABASE_URL` (host `...pooler.supabase.com`, port **6543**) |
| **Direct connection** | tamtéž → hodnota `DIRECT_URL` (port **5432**) |

V connection stringu nahraď `[YOUR-PASSWORD]` heslem z bodu 1.

## 3. Nastavení environment proměnných

Vzor je v [`.env.example`](.env.example). Pro produkci nastav (ve Vercelu, ne do
gitu):

```env
DATABASE_URL="postgresql://postgres.[ref]:[HESLO]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[HESLO]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Povinné v produkci — bez něj se app odmítne spustit:
SESSION_SECRET="<openssl rand -base64 48>"

# Reálná doména (jinak notifikační odkazy spadnou na localhost):
APP_BASE_URL="https://app.syndikat.legal"

# Cron pro notifikace (POST /api/internal/notifications/run):
NOTIFICATION_RUN_SECRET="<silný náhodný řetězec ≥ 32 znaků>"
```

`SESSION_SECRET` vygeneruj: `openssl rand -base64 48`.

> `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` a
> `SUPABASE_SERVICE_ROLE_KEY` aplikace **nečte** — nech je prázdné. Service role
> key se **nikdy** nesmí dostat do browseru.

## 4. Rozdíl `DATABASE_URL` vs `DIRECT_URL`

- **`DATABASE_URL` (pooled, port 6543)** — používá běžící aplikace (Prisma
  runtime přes pg adapter). Pooler (Supavisor, transaction mode) zvládá mnoho
  krátkých serverless spojení z Vercelu.
- **`DIRECT_URL` (direct, port 5432)** — používají **jen** Prisma migrace a
  studio. Migrace přes pooler nefungují spolehlivě, proto jdou napřímo.

Zapojení: `prisma.config.ts` bere pro migrace `DIRECT_URL ?? DATABASE_URL`;
`src/lib/prisma.ts` (runtime) bere `DATABASE_URL`. Lokálně, kde `DIRECT_URL`
není, vše spadne na jediné `DATABASE_URL` — žádná lokální změna není potřeba.

## 5. Spuštění produkčních migrací

Migrace se **nespouští automaticky** při buildu (bezpečnější pro právní data).
Spusť je vědomě, lokálně se nastaveným prod `DIRECT_URL`, nebo jako CI krok:

```bash
npm run db:deploy        # = prisma migrate deploy
```

Aplikuje všech 15 migrací z `prisma/migrations/` na prázdnou Supabase DB. Idempotentní —
už aplikované migrace přeskočí.

## 6. Seed dat — jen pro development/demo

`npm run db:seed` vkládá **demo data** (vč. demo uživatelů). **Nespouštěj ho
proti produkci.**

Prvního produkčního uživatele a organizaci vytvoř přes UI:

1. Otevři nasazenou aplikaci → `/register` (veřejná routa).
2. Zaregistruj účet (heslo se uloží jako scrypt hash).
3. Vytvoř organizaci (`/join-organization` → vytvořit). Tím dostaneš první
   PARTNER/ADMIN účet a tenant.

## 7. Auth redirect URL

Aplikace **nepoužívá Supabase Auth** → v Supabase se nic ohledně redirect URL
nenastavuje. Login/logout řeší vlastní routy (`/login`, server action
`logoutAction`).

## 8. Storage

Aplikace **nenahrává soubory** → žádný Storage bucket se nezakládá. (Reference
i SharePoint pole jsou jen textové odkazy.) Pokud se uploady v budoucnu přidají,
teprve pak vytvoř privátní bucket + policies.

## 9. Deploy na Vercel

1. **Import** repozitáře na [vercel.com](https://vercel.com) → New Project.
2. Framework: **Next.js** (autodetekce). Build command i output nech výchozí —
   `postinstall`/`prebuild` samy spustí `prisma generate`, takže se na Vercelu
   vygeneruje Prisma klient.
3. **Settings → Environment Variables**: vlož proměnné z bodu 3 (Production,
   případně i Preview se *samostatným* dev Supabase projektem).
4. **Deploy.**
5. Po prvním (nebo migrující) deployi spusť migrace dle bodu 5
   (`npm run db:deploy` proti prod `DIRECT_URL`).
6. (Volitelné) Notifikace: nastav Vercel Cron na `POST
   /api/internal/notifications/run` s hlavičkou `Authorization: Bearer
   $NOTIFICATION_RUN_SECRET`.

## 10. Doporučení pro produkci

- **Oddělené Supabase projekty** pro development a production (žádné míchání dat).
- **Necommituj secrets** — `.env*` je v `.gitignore` (kromě `.env.example`).
  Produkční hodnoty žijí jen ve Vercelu / správci tajemství.
- **Pravidelné zálohy** — zapni Point-in-Time Recovery / denní zálohy v Supabase.
- **Seed bez demo právních dat** v produkci — bootstrap přes `/register` (bod 6).
- **Omezený přístup k prod DB** — heslo jen pro nezbytné osoby; zvaž IP
  restrikce v Supabase (Settings → Database → Network).

---

## Row Level Security (RLS)

**RLS se záměrně nezapíná.** Veškerá komunikace s DB jde výhradně přes Next.js
server a Prisma, které se připojují jako **vlastník databáze** — ten RLS
**obchází**. Slepé zapnutí RLS by tedy Prisma přístup neochránilo (jen by zmátlo)
a riskovalo by rozbití migrací/CRUD.

Bezpečnost je místo toho zajištěna na úrovni aplikace a sítě:

- **Browser nikdy nesahá na DB přímo** — žádný Supabase klient, žádný anon key
  v provozu. Citlivá právní data tečou jen přes server.
- **Service role key se nepoužívá na klientovi** (a obecně se nepoužívá).
- **Autorizace a tenant izolace** jsou vynucené v query vrstvě
  (`src/lib/permissions.ts` — `*VisibilityWhere`, `assertCan*`), ne v DB.
- DB drž **neveřejnou** (Supabase Network restrictions, silné heslo).

Kdyby se v budoucnu přidal přímý přístup z browseru přes Supabase klient,
**teprve pak** nastav RLS policies pro tabulky vystavené anon/authenticated roli
— ale Prisma serverové připojení nech pod rolí, která RLS obchází.

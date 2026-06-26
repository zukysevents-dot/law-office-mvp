# Law Office MVP

Interní Next.js aplikace pro první etapu systému advokátní kanceláře. Hlavní
databázovou entitou je `Subject`; klient, protistrana a další role jsou vedené
přes `SubjectRelation` v kontextu projektu nebo případu.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma ORM

## Lokální spuštění

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Aplikace poběží na `http://127.0.0.1:3001`.

Pro produkční nasazení (Supabase PostgreSQL + Vercel) viz
[`DEPLOYMENT.md`](DEPLOYMENT.md).

Ve Windows PowerShellu lze `.env` vytvořit příkazem:

```powershell
Copy-Item .env.example .env
```

Pro ověření čistého lokálního checkoutu spusťte:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
npm run build
```

## Prisma

Prisma schema je v `prisma/schema.prisma`. Prisma v7 používá `prisma.config.ts`
pro načtení `DATABASE_URL`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Hotové v první etapě

- základní aplikační layout s levým menu,
- Dashboard se statistikami,
- datový model pro subjekty, conflict checky, projekty, případy, úkoly, work
  logy, role uživatelů a audit,
- modul Subjekty se seznamem, vyhledáváním, formulářem a detailem,
- modul Conflict check s uložením prověření,
- moduly Projekty a Případy se základními detaily,
- modul Úkoly se změnou statusu a zápisem historie,
- modul Výkazy práce,
- role uživatelů v Nastavení,
- připravené hranice pro Microsoft login, notifikace, SharePoint URL a budoucí
  AI asistenci u work logů.

## Další krok

Napojit reálné přihlášení, zpřesnit oprávnění podle rolí, doplnit editační
formuláře a připravit první seed data pro kancelář.

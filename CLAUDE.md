# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Internal MVP for a law office (Czech-language UI). Next.js 16 App Router + React 19 + TypeScript + Prisma 7 + PostgreSQL. Single app, no monorepo. Dev server runs on `http://127.0.0.1:3001`.

## Commands

Package manager is **npm** (`package-lock.json`).

```bash
npm run dev          # next dev on 127.0.0.1:3001 (runs prisma generate first)
npm run build        # next build (runs prisma generate first)
npm run lint         # eslint (flat config, eslint-config-next)

docker compose up -d # start PostgreSQL 17 (db law_office_mvp, postgres:postgres, :5432)
npm run db:migrate   # prisma migrate dev
npm run db:push      # prisma db push (no migration file)
npm run db:seed      # tsx prisma/seed.ts
npm run db:studio    # prisma studio
npm run db:generate  # prisma generate
```

First-time setup: `npm install` → `cp .env.example .env` → `docker compose up -d` → `npm run db:migrate` → `npm run db:seed` → `npm run dev`.

**There is no test framework** — verification is `npm run lint` + `npm run build`.

`DATABASE_URL` is required. Email/notification env vars (`EMAIL_NOTIFICATIONS_ENABLED`, `SMTP_*`, `NOTIFICATION_RUN_SECRET`, `APP_BASE_URL`) and `DEMO_USER_EMAIL` are in `.env.example`.

## Architecture

**Thick server actions, thin frontend.** No REST/tRPC/GraphQL API for app logic — pages are async Server Components that query Prisma directly, and mutations go through server actions in `src/app/actions/*.ts`. Forms post `FormData` to actions; actions validate → mutate → write an audit log → `revalidatePath()` → `redirect()`. There is no client state library. The only HTTP route is `src/app/api/internal/notifications/run/route.ts` (cron trigger, Bearer-auth via `NOTIFICATION_RUN_SECRET`).

**Domain model** lives entirely in `prisma/schema.prisma`. Core entities: `Subject` (unified registry of clients/counterparties/contacts), `SubjectRelation` (links a Subject to a Project/Case with a role), `Project` → `Case` (nested) → `Task`, `WorkLog` (time + billing), `Reference`, `ConflictCheck`, plus `User`, `AuditLog`, `Notification`/`NotificationPreference`, and per-user UI prefs (`DashboardWidget`, `TableViewPreference`).

**Auth & permissions** — the critical cross-cutting concern.
- `src/lib/auth.ts` — `getCurrentUser()` resolves the active user (via `DEMO_USER_EMAIL`, else first active user). No real SSO yet (`microsoftId` field reserved).
- `src/lib/permissions.ts` — the authority on role-based access. Roles: `ADMIN`/`PARTNER` (see all legal data) > `LAWYER` > `TRAINEE` > `INTERN`. Visibility is enforced **at the query layer** via `*VisibilityWhere(user)` helpers (`taskVisibilityWhere`, `projectVisibilityWhere`, `caseVisibilityWhere`, `workLogVisibilityWhere`, `referenceVisibilityWhere`, `subjectVisibilityWhere`) that return Prisma `where` fragments — compose them with `andWhere(...)`. Mutations call `assertCanEditRecord(user, type, record)` (and `assertCanArchiveRecords` / `assertCanViewAuditLog` / `assertCanManageUsers`) before writing. **When adding any query or mutation, apply the matching visibility/assert helper** — this is how access control is enforced repo-wide.

**Notifications use an outbox pattern** in `src/lib/notifications/notification-service.ts`. Mutations queue `Notification` rows (status `PENDING`/`SKIPPED`, deduped by `dedupeKey`, respecting each recipient's `NotificationPreference`). Delivery is separate: the cron route calls `runScheduledNotifications()`, which also creates scheduled deadline/filed-followup notifications, locks rows via `lockedAt`, sends via nodemailer, and records `SENT`/`FAILED` with retry `attempts`.

**Conventions to follow:**
- DB access: `getPrisma()` singleton from `src/lib/prisma.ts`. In pages, wrap reads in `safeQuery(fallback, fn)` from `src/lib/db-safe.ts` so DB-down states degrade gracefully (renders a Czech "database not ready" notice).
- After every create/update/archive/restore, write an audit entry via `writeAuditLog(...)` in `src/lib/audit.ts`.
- Parse `FormData` with the helpers in `src/lib/form.ts` (`requiredString`, `optionalString`, `optionalNumber`, `optionalDate`, `enumValue`) — there is no Zod.
- UI strings are Czech. Enum→label mappings live in `src/lib/labels.ts`; formatting in `src/lib/format.ts`; status badge colors in `src/lib/status-tones.ts`.
- Path alias `@/*` → `./src/*`.

The generated Prisma client is committed at `src/generated/prisma/` — import types from there, and run `npm run db:generate` after schema changes.

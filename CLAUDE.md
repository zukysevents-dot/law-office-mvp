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

**Thick server actions, thin frontend.** No REST/tRPC/GraphQL API for app logic — pages are async Server Components that query Prisma directly, and mutations go through server actions in `src/app/actions/*.ts`. Forms post `FormData` to actions; actions validate → mutate → write an audit log → `revalidatePath()` → `redirect()`. There is no client state library. The only HTTP route is `src/app/api/internal/notifications/run/route.ts` (cron trigger, Bearer-auth via `NOTIFICATION_RUN_SECRET`). `src/proxy.ts` (Next 16 replacement for middleware) is the front door: app paths require a valid session cookie (else redirect to `/login`), and hosts listed in `LANDING_ONLY_HOSTS` serve only the landing page `/` — every other path 307-redirects to `/` and the landing hides its login CTAs there (`src/lib/landing-mode.ts`).

**Domain model** lives entirely in `prisma/schema.prisma`. Core entities: `Subject` (unified registry of clients/counterparties/contacts), `SubjectRelation` (links a Subject to a Project/Case with a role), `Project` → `Case` (nested) → `Task`, `WorkLog` (time + billing), `Reference`, `ConflictCheck`, plus `User`, `AuditLog`, `Notification`/`NotificationPreference`, and per-user UI prefs (`DashboardWidget`, `TableViewPreference`).

**Auth & permissions** — the critical cross-cutting concern.
- `src/lib/auth.ts` — `getCurrentUser()` resolves the active user (via `DEMO_USER_EMAIL`, else first active user). No real SSO yet (`microsoftId` field reserved).
- **Permission matrix** — what each role sees and may do is configurable per office (Nastavení → Oprávnění, `/settings/permissions`). `src/lib/permission-catalog.ts` is the single catalog of permission keys with the **default value per role** (`module.*` = menu section + route access, `scope.*` = data scope `ALL`/`ASSIGNED`/`OWN`, `function.*` = capabilities). Offices store only deviations in `rolePermissionOverrides` / `userPermissionOverrides` (no row = default). `src/lib/permission-resolver.ts` (pure) resolves default → role override → legacy `UserCapabilityGrant` (deprecated, dual-written) → user override; `ADMIN` always has everything. `getCurrentUser()` resolves the matrix once per request and attaches it as `user.permissions`. Default: every role sees all subjects/projects/cases/tasks of its office; rates/amounts only with `function.viewRates`. Rate fields (hourly rate, flat fee, subject fee note) are rendered only with `canViewRates`, and actions drop them from the write without it (`subjectWriteData`); the audit-log view/export masks them (`src/lib/audit-redact.ts`). Every create/update/archive action also calls `assertCanAccessModule(user, "module.*")` (`src/lib/module-access.server.ts`; archive via `setArchived`).
- `src/lib/permissions.ts` — the authority on access; every helper reads the matrix. Visibility is enforced **at the query layer** via `*VisibilityWhere(user)` helpers (`taskVisibilityWhere`, `projectVisibilityWhere`, `caseVisibilityWhere`, `workLogVisibilityWhere`, `referenceVisibilityWhere`, `subjectVisibilityWhere`, …) that return Prisma `where` fragments (org first, then the user's scope) — compose them with `andWhere(...)`. Functions: `hasPermission`, `canViewRates`, `canArchiveRecords`, `canApproveWorkLogs`, `canManageOrganization`, `canViewTeamReports`, `canManagePermissions`, … Mutations call `assertCanEditRecord(user, type, record)` (and `assertCanArchiveRecords` / `assertCanViewAuditLog` / `assertCanManageUsers` / …) before writing. **When adding any query or mutation, apply the matching visibility/assert helper** — this is how access control is enforced repo-wide. There is no "sees everything" role shortcut — ask for the specific permission.
- Řešitelé (`src/lib/assignments.ts`): a project/case has a responsible user, person assignees (`ProjectAssignee` / `CaseAssignee`) and whole legal teams (`ProjectTeamAssignment` / `CaseTeamAssignment`). The ASSIGNED scope covers direct assignees AND members of assigned, non-archived teams (membership is read live, so joining/leaving a team changes access immediately). In-memory checks (`canEditRecord` / `canViewRecord` on Project/Case) need the team rows — load them with `projectAssignmentInclude` / `caseAssignmentInclude` (or `teamAssignmentDisplaySelect`), otherwise a team member is denied (fail-closed). Assigning/unassigning goes through `src/lib/matter-assignments.server.ts` (audit + `MATTER_ASSIGNED` notifications). Teams and bulk assignment live on `/settings/assignments` („Týmy a řešitelé“; `canManageTeams` / `canBulkAssign`).
- Module access: `src/lib/module-access.server.ts` — `canAccessModule` / `assertCanAccessModule` / `moduleAccessDenial` = matrix `module.*` ∧ office entitlement. Every module page starts with the `moduleAccessDenial` guard (renders `<AccessDenied>`), route handlers return 403, server actions call `assertCanAccessModule`. A new permission = add it to the catalog (with defaults for all roles) and consult it via a helper; no migration needed.

**Notifications use an outbox pattern** in `src/lib/notifications/notification-service.ts`. Mutations queue `Notification` rows (status `PENDING`/`SKIPPED`, deduped by `dedupeKey`, respecting each recipient's `NotificationPreference`). Delivery is separate: the cron route calls `runScheduledNotifications()`, which also creates scheduled deadline/filed-followup notifications, locks rows via `lockedAt`, sends via nodemailer, and records `SENT`/`FAILED` with retry `attempts`.

**Conventions to follow:**
- DB access: `getPrisma()` singleton from `src/lib/prisma.ts`. In pages, wrap reads in `safeQuery(fallback, fn)` from `src/lib/db-safe.ts` so DB-down states degrade gracefully (renders a Czech "database not ready" notice).
- After every create/update/archive/restore, write an audit entry via `writeAuditLog(...)` in `src/lib/audit.ts`.
- Parse `FormData` with the helpers in `src/lib/form.ts` (`requiredString`, `optionalString`, `optionalNumber`, `optionalDate`, `enumValue`) — there is no Zod.
- UI strings are Czech. Enum→label mappings live in `src/lib/labels.ts`; formatting in `src/lib/format.ts`; status badge colors in `src/lib/status-tones.ts`.
- Path alias `@/*` → `./src/*`.

The generated Prisma client lives in `src/generated/prisma/` (gitignored) — import types from there, and run `npm run db:generate` after schema changes.

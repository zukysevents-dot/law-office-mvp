# Supabase setup

How this app runs on **Supabase as its managed Postgres host**, with RLS as
defense-in-depth. The integration is deliberately **non-destructive**: the data
layer stays Prisma, auth stays the existing custom cookie/session system, and
the UI is unchanged. Supabase replaces the *database server*, not the app.

> **Architecture decision.** The app already had PostgreSQL (Prisma), a working
> custom multi-tenant auth system, and query-layer tenant isolation
> (`src/lib/permissions.ts`). We did **not** swap in Supabase Auth or rewrite
> queries to `supabase-js` — that would mean replacing working, audited systems
> for no functional gain. Supabase Auth / Storage can be adopted later; the
> seam is `src/lib/supabase/server.ts`.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a region close to your users (e.g. `eu-central-1` for CZ) and set a
   strong database password — you'll need it for `DATABASE_URL`.
3. Wait for provisioning to finish.

## 2. Get the connection string

Project → **Settings → Database → Connection string**. Use the **Session
pooler** string (host `...pooler.supabase.com`, port **5432**):

```
postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Why the session pooler (not the 6543 transaction pooler): this app is a
long-running `next start` server using `node-postgres` (`@prisma/adapter-pg`),
which uses prepared statements. The **session** pooler supports them and works
for both the app runtime *and* `prisma migrate deploy`. The 6543 transaction
pooler would require `?pgbouncer=true` + a separate `DIRECT_URL` for
migrations — unnecessary complexity here.

## 3. Environment variables

Copy `.env.example` → `.env` and set:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | The session-pooler string from step 2. Used by Prisma at runtime **and** by migrations (via `prisma.config.ts`). |
| `SESSION_SECRET` | **yes (prod)** | ≥32 random chars: `openssl rand -base64 48`. App refuses to start in production without it. |
| `SUPABASE_URL` | optional | Only if you use the Supabase JS client (storage/admin). Project → Settings → API → Project URL. |
| `SUPABASE_ANON_KEY` | optional | Same page → `anon` `public` key. |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Same page → `service_role` key. **Server-only** — no `NEXT_PUBLIC_` prefix, never expose to the browser. |

`.gitignore` already excludes every `.env*` except `.env.example`. Never commit
real secrets.

## 4. Run the database migrations

The Prisma migrations in `prisma/migrations/` are standard PostgreSQL and apply
to Supabase unchanged.

```bash
npx prisma migrate deploy   # creates all tables in the Supabase database
npm run db:seed             # optional: demo users / org (sets initial passwords)
```

`migrate deploy` (not `migrate dev`) is the production command — it applies
committed migrations without trying to create new ones.

## 5. Enable Row Level Security — **required**

Supabase auto-exposes every `public` table over its REST API (PostgREST) to the
`anon` / `authenticated` roles using the anon key. This app doesn't use that
API, but the tables are exposed anyway. **You must enable RLS to close that
door**, or anyone with the anon key could read/write all firm data.

Apply `supabase/sql/01_rls_baseline.sql` after the first `migrate deploy`
(and again after any migration that adds tables). Either:

- **Dashboard:** SQL Editor → paste the file → **Run**, or
- **psql:** `psql "$DATABASE_URL" -f supabase/sql/01_rls_baseline.sql`

This enables RLS on all tables and revokes anon/authenticated grants. It is
**safe and non-breaking**: RLS is enabled but never *forced*, so the owner role
Prisma connects as bypasses it — the app keeps working exactly as before, and
tenant isolation continues to be enforced in the query layer. It is idempotent;
re-run it any time.

### Auth redirect URLs

**Not applicable.** Auth is the app's own cookie/session system, not Supabase
Auth (GoTrue). There are no Supabase auth providers, callback URLs, or redirect
allow-lists to configure. If you ever adopt Supabase Auth, that's where this
section would go.

## 6. Optional: run the app *under* RLS (tenant-scoped policies)

`supabase/sql/02_tenant_scoped_rls_optional.sql` adds true per-tenant policies
(a firm sees only its own rows) on the seven org-scoped tables, plus a
non-privileged `app_rls` role. This is **opt-in** defense-in-depth so that even
a query-layer bug can't cross firms.

Applying the file is safe even if you never adopt it: the policies are dormant
for the app today (the app connects as the owner, which bypasses RLS). They only
take effect for a role like `app_rls`.

To actually enforce it:

1. Apply the file, then set a password: `ALTER ROLE app_rls PASSWORD '<secret>';`
   and grant it connect on the database.
2. Point the app at a second connection that logs in as `app_rls`.
3. Wrap reads/writes in a transaction that sets the org GUC first. The codebase
   already uses `prisma.$transaction` + `$queryRaw`, so the helper is small:

   ```ts
   // sets the per-request tenant, then runs your queries under RLS
   export function withOrgScope<T>(orgId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
     return getPrisma().$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
       return fn(tx);
     });
   }
   ```

Caveat: the auth/login queries run **before** any org context exists, and some
tables (`users`, `auditLogs`, the `organization_*` tables) have no direct org
column — covering those is additional work. That's why this is documented as a
larger, optional step rather than wired in. For most deployments,
`01_rls_baseline.sql` (closing the public REST surface) is the meaningful win.

---

## Security checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only read in server code
      (`src/lib/supabase/server.ts`). It has no `NEXT_PUBLIC_` prefix, so Next
      never inlines it into the client bundle, and the factories throw if called
      in the browser.
- [ ] `01_rls_baseline.sql` has been applied: RLS is **on** for every table.
      Verify: `select tablename, rowsecurity from pg_tables where schemaname='public';`
      — every row should show `rowsecurity = true`.
- [ ] `anon` / `authenticated` have no table grants (run the baseline file).
- [ ] `SESSION_SECRET` is set to a strong random value in production.
- [ ] `.env` is **not** committed (`git status` should never show it).
- [ ] All Prisma reads/mutations still go through the visibility/assert helpers
      in `src/lib/permissions.ts` (tenant scoping). Adding a new query? Apply the
      matching `*VisibilityWhere(user)` — see CLAUDE.md.
- [ ] Database password and pooler string are stored as deployment secrets, not
      in the repo.

## Smoke test (manual)

After deploy + migrations + `01_rls_baseline.sql`, with `npm run db:seed` data
(or a fresh registration):

| # | Step | Expected |
|---|---|---|
| 1 | Register a new account at `/register` | Account created → redirected to `/join-organization` |
| 2 | Log in at `/login` | Redirected to `/dashboard` |
| 3 | Visit `/login` while logged in | Bounced back into the app (no re-login form) |
| 4 | Current user resolves | Dashboard shows your name/role (via `getCurrentUser()`) |
| 5 | Create an entity (e.g. a Subject) | Saved; appears in the list; an `AuditLog` row is written |
| 6 | Read your own entity | Visible to you |
| 7 | Cross-firm isolation | A user in firm B cannot see firm A's subjects/cases/etc. (query-layer scoping; with file 02 + `app_rls`, also enforced by RLS) |
| 8 | Dashboard protection | Hitting `/dashboard` logged out → redirected to `/login` |
| 9 | Log out | Session cleared → `/login` |

### Verify RLS actually closed the REST door

With `SUPABASE_URL` + `SUPABASE_ANON_KEY` set, the anon REST API must return no
rows for a tenant table:

```bash
curl "$SUPABASE_URL/rest/v1/subjects?select=id" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected after 01_rls_baseline.sql: [] (or a permission error) — never your data.
```

## What you must do manually in the Supabase dashboard

1. Create the project, region, and DB password (step 1).
2. Copy the **Session pooler** connection string into `DATABASE_URL` (step 2–3).
3. (If using the JS client) copy Project URL + anon + service_role keys.
4. Run `prisma migrate deploy`, then apply `supabase/sql/01_rls_baseline.sql`
   in the SQL Editor (steps 4–5).
5. Confirm `rowsecurity = true` for all tables and that the anon `curl` returns
   no data (security checklist).

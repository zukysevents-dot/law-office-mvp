-- ============================================================================
-- 02_tenant_scoped_rls_optional.sql — OPTIONAL defense-in-depth.
-- ============================================================================
--
-- This goes a step beyond 01_rls_baseline.sql: instead of only closing the
-- public/anon REST surface, it lets you run the APPLICATION ITSELF under RLS, so
-- that even a bug in the query layer cannot leak one firm's data to another.
--
-- HOW IT WORKS
--   * A dedicated login role `app_rls` that is NOT the table owner and does NOT
--     have BYPASSRLS — so policies actually apply to it.
--   * Per-request, the app sets a transaction-local GUC with the caller's org:
--         SELECT set_config('app.current_org_id', '<organizationId>', true);
--     (`true` = local to the current transaction; safe under PgBouncer
--     transaction pooling). The policies below filter on that GUC.
--   * The app connects as `app_rls` (a second DATABASE_URL) and wraps its reads
--     in a transaction that sets the GUC first. The existing code already uses
--     prisma.$transaction + $queryRaw, so the pattern fits — see SUPABASE_SETUP.md
--     ("Optional: run the app under RLS") for the helper.
--
-- SAFE TO APPLY EVEN IF YOU NEVER ADOPT IT
--   These policies are DORMANT for the app today: the running app connects as
--   the owner, which bypasses RLS (01 never FORCEs it). The policies only take
--   effect for a non-owner role such as `app_rls`. So applying this file cannot
--   break the current app — it only prepares the opt-in path.
--
-- SCOPE
--   Covers the seven tenant tables that carry a NOT NULL `organizationId` — the
--   sensitive legal data. Tables without a direct org column (users, auditLogs,
--   the organization_* tables, per-user UI prefs) need their own policies and,
--   crucially, the login/auth queries run BEFORE any org context exists; wiring
--   those is the larger effort described in SUPABASE_SETUP.md. Not done here.
--
-- NOTE ON IDENTIFIERS: Prisma maps table names (@@map) but NOT column names, so
-- the column is the camelCase, case-sensitive "organizationId" (quoted by %I).
-- ============================================================================

-- 1) Dedicated, non-privileged application role. Set its password separately:
--      ALTER ROLE app_rls PASSWORD '<a strong random secret>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_rls') then
    create role app_rls login;
  end if;
end
$$;

grant usage on schema public to app_rls;
grant select, insert, update, delete on all tables in schema public to app_rls;
grant usage, select on all sequences in schema public to app_rls;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_rls;

-- 2) Per-tenant isolation policies on the org-scoped tables. A row is visible /
--    writable only when its organizationId equals the GUC set for the request.
--    No `using (true)` anywhere — an unset/empty GUC matches no rows (fail-closed).
do $$
declare
  t          text;
  org_tables text[] := array[
    'subjects', 'conflictChecks', 'projects', 'cases',
    'tasks', 'workLogs', 'references'
  ];
begin
  foreach t in array org_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format(
      'create policy tenant_isolation on public.%I '
      || 'using ("organizationId" = current_setting(''app.current_org_id'', true)) '
      || 'with check ("organizationId" = current_setting(''app.current_org_id'', true));',
      t
    );
  end loop;
end
$$;

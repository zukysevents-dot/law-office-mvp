-- ============================================================================
-- 01_rls_baseline.sql — REQUIRED hardening when hosting this DB on Supabase.
-- ============================================================================
--
-- WHY THIS MATTERS
--   Supabase auto-exposes every table in the `public` schema through its REST
--   API (PostgREST) to the `anon` and `authenticated` Postgres roles, reachable
--   with the publishable anon key. This application does NOT use that API and
--   does NOT use Supabase Auth — it talks to Postgres directly through Prisma as
--   the database owner. Without RLS, ANYONE holding the anon key could read and
--   write every firm's data over REST. This file shuts that door.
--
-- WHAT IT DOES
--   For every table in `public`:
--     * enables Row Level Security (RLS on + no permissive policy = default-deny)
--     * revokes all grants from `anon` and `authenticated`
--   Result: the public REST/anon surface returns nothing for these tables.
--
-- WHY IT DOES NOT BREAK THE APP
--   RLS is ENABLED but never FORCED. The table owner (the role Prisma connects
--   as) and `service_role` bypass RLS, so the application keeps full access.
--   Tenant isolation for the app continues to be enforced at the query layer
--   (src/lib/permissions.ts), exactly as before.
--
-- WHEN TO RUN
--   After the very first `prisma migrate deploy`, and again after any migration
--   that creates new tables (a freshly created table has RLS OFF until enabled).
--   Safe to re-run at any time — it is idempotent.
--
-- See SUPABASE_SETUP.md for how to apply and how to verify.
-- ============================================================================

do $$
declare
  t           record;
  has_anon    boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_authed  boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    -- ENABLE (not FORCE): owner / service_role still bypass, app unaffected.
    execute format('alter table public.%I enable row level security;', t.tablename);

    -- Remove the auto-granted REST privileges for the public-facing roles.
    if has_anon then
      execute format('revoke all on public.%I from anon;', t.tablename);
    end if;
    if has_authed then
      execute format('revoke all on public.%I from authenticated;', t.tablename);
    end if;
  end loop;
end
$$;

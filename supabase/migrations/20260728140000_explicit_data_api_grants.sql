-- 20260728140000_explicit_data_api_grants.sql
-- P0 security fix (audit 2026-07-28): explicit Data API grants + REVOKE anon.
--
-- Supabase is removing the implicit grant on public.* (enforced 2026-10-30).
-- Today anon and authenticated hold implicit CRUD on every base table, gated
-- only by RLS. This app never touches a public table through those roles: all
-- data access goes through the service-role client, and the anon client is used
-- solely for supabase.auth.* (which lives in the auth schema, not public). So
-- the correct, non-breaking posture is the strict regime from CLAUDE.md:
--
--   * future tables/views: revoked from anon + authenticated by default, so a
--     new table without explicit grants is invisible to the Data API (a mistake
--     surfaces in the next PR, not five months later);
--   * service_role: explicit CRUD, so the backend keeps working after the
--     enforcement date;
--   * existing tables/views: retrofit the same via a loop.
--
-- Idempotent: grants/revokes and ALTER DEFAULT PRIVILEGES are safe to re-run.

-- 1. Strict default for anything created later in public.
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- 2. Retrofit every existing table and view.
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
  loop
    execute format('revoke all on public.%I from anon, authenticated;', r.relname);
    if r.relkind = 'r' then
      execute format(
        'grant select, insert, update, delete on public.%I to service_role;',
        r.relname
      );
    else
      -- Views are read-only; service_role only needs SELECT.
      execute format('grant select on public.%I to service_role;', r.relname);
    end if;
  end loop;
end $$;

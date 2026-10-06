-- ---------------------------------------------------------------------------
-- LOCAL TEST DATABASE ONLY. Do not apply this to Supabase.
--
-- Supabase hosts already provide the `anon`, `authenticated` and `service_role`
-- roles and the `auth.uid()` function. A bare Postgres does not, so the RLS
-- migration (0002) would fail to apply and acceptance test 8 could not run.
-- This file creates just enough of that surface for the real policies to be
-- exercised locally against the real constraints.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- Matches Supabase: the service role bypasses RLS. This is why the spec
  -- insists the key never reaches the browser.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Mirrors Supabase's auth.uid(): the authenticated user's id, taken from the
-- request's JWT claims. Tests set it with:
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<uuid>';
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;

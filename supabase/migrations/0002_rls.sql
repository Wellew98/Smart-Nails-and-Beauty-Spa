-- ---------------------------------------------------------------------------
-- Row Level Security — spec §7
--
--   anon           SELECT on businesses, services, staff, resources,
--                  working_hours where active = true. No access to
--                  appointments or customers.
--   authenticated  full access scoped to their business_id, enforced HERE and
--                  never in application code.
--   service_role   bypasses RLS entirely (Supabase grants it BYPASSRLS). All
--                  writes to appointments go through route handlers using it.
--
-- Acceptance test 8 asserts that the anon key can neither read nor insert
-- appointments. That guarantee lives in this file, not in the app.
-- ---------------------------------------------------------------------------

alter table businesses          enable row level security;
alter table services            enable row level security;
alter table staff               enable row level security;
alter table resources           enable row level security;
alter table staff_services      enable row level security;
alter table service_resources   enable row level security;
alter table working_hours       enable row level security;
alter table availability_blocks enable row level security;
alter table customers           enable row level security;
alter table appointments        enable row level security;
alter table appointment_events  enable row level security;
alter table business_members    enable row level security;

-- Table privileges.
--
-- Supabase ships `alter default privileges ... grant all on tables to anon`,
-- so every table created by 0001 would otherwise be readable-by-grant and left
-- entirely to RLS. We revoke that first and hand back only what §7 lists, so
-- the anon role has no privilege at all on appointments or customers — a
-- second, independent lock in front of the policies rather than one.
revoke all on all tables in schema public from anon;

grant usage on schema public to anon, authenticated;
grant select on businesses, services, staff, resources, working_hours to anon;
grant all on all tables in schema public to authenticated;

-- Which business does the current user own? Used by every authenticated policy.
-- SECURITY DEFINER so reading business_members inside a policy does not
-- recurse into business_members' own policy.
create or replace function public.current_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from business_members where user_id = auth.uid();
$$;

-- ---------- public read surface (§7: anon) ----------

create policy anon_read_businesses on businesses
  for select to anon using (true);

create policy anon_read_services on services
  for select to anon using (active);

create policy anon_read_staff on staff
  for select to anon using (active);

create policy anon_read_resources on resources
  for select to anon using (active);

create policy anon_read_working_hours on working_hours
  for select to anon
  using (exists (select 1 from staff s where s.id = working_hours.staff_id and s.active));

-- Deliberately NO anon policy on: staff_services, service_resources,
-- availability_blocks, customers, appointments, appointment_events.
-- RLS denies by default, so those are closed. Availability is computed
-- server-side with the service role and returned as bare start times.

-- ---------- owner surface (§7: authenticated, scoped in the policy) ----------

create policy owner_rw_businesses on businesses
  for all to authenticated
  using (id in (select current_business_ids()))
  with check (id in (select current_business_ids()));

create policy owner_rw_services on services
  for all to authenticated
  using (business_id in (select current_business_ids()))
  with check (business_id in (select current_business_ids()));

create policy owner_rw_staff on staff
  for all to authenticated
  using (business_id in (select current_business_ids()))
  with check (business_id in (select current_business_ids()));

create policy owner_rw_resources on resources
  for all to authenticated
  using (business_id in (select current_business_ids()))
  with check (business_id in (select current_business_ids()));

create policy owner_rw_customers on customers
  for all to authenticated
  using (business_id in (select current_business_ids()))
  with check (business_id in (select current_business_ids()));

create policy owner_rw_appointments on appointments
  for all to authenticated
  using (business_id in (select current_business_ids()))
  with check (business_id in (select current_business_ids()));

-- Join tables and staff-scoped tables reach the business through their parent.
create policy owner_rw_staff_services on staff_services
  for all to authenticated
  using (exists (
    select 1 from staff s
    where s.id = staff_services.staff_id
      and s.business_id in (select current_business_ids())))
  with check (exists (
    select 1 from staff s
    where s.id = staff_services.staff_id
      and s.business_id in (select current_business_ids())));

create policy owner_rw_service_resources on service_resources
  for all to authenticated
  using (exists (
    select 1 from services sv
    where sv.id = service_resources.service_id
      and sv.business_id in (select current_business_ids())))
  with check (exists (
    select 1 from services sv
    where sv.id = service_resources.service_id
      and sv.business_id in (select current_business_ids())));

create policy owner_rw_working_hours on working_hours
  for all to authenticated
  using (exists (
    select 1 from staff s
    where s.id = working_hours.staff_id
      and s.business_id in (select current_business_ids())))
  with check (exists (
    select 1 from staff s
    where s.id = working_hours.staff_id
      and s.business_id in (select current_business_ids())));

create policy owner_rw_availability_blocks on availability_blocks
  for all to authenticated
  using (
    exists (select 1 from staff s
            where s.id = availability_blocks.staff_id
              and s.business_id in (select current_business_ids()))
    or exists (select 1 from resources r
               where r.id = availability_blocks.resource_id
                 and r.business_id in (select current_business_ids())))
  with check (
    exists (select 1 from staff s
            where s.id = availability_blocks.staff_id
              and s.business_id in (select current_business_ids()))
    or exists (select 1 from resources r
               where r.id = availability_blocks.resource_id
                 and r.business_id in (select current_business_ids())));

create policy owner_read_appointment_events on appointment_events
  for select to authenticated
  using (exists (
    select 1 from appointments a
    where a.id = appointment_events.appointment_id
      and a.business_id in (select current_business_ids())));

create policy owner_read_membership on business_members
  for select to authenticated
  using (user_id = auth.uid());

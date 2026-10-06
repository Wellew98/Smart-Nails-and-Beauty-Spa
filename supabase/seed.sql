-- ---------------------------------------------------------------------------
-- Seed data — spec §10
--
-- ⚠ SAMPLE DATA. NEVER DEPLOY THIS TO PRODUCTION.
-- The therapists ("Sarah", "Nomsa", "Lerato"), the five treatments and their
-- prices are spec §10's EXAMPLES, not Grace Nails and Beauty Spa's real staff
-- or price list. Putting them in front of customers would advertise invented
-- people and invented prices.
--
-- This file is for the acceptance tests and local development only. Supabase's
-- GitHub integration does not apply it to the hosted project (seed.sql is
-- documented as preview-branch only), and `npm run db:migrate` only applies it
-- when you pass --with-sample-data. The real business row deploys separately
-- via migrations/0003_business.sql.
--
-- Fixed UUIDs so the acceptance tests in §9 can reference rows directly
-- without a lookup round-trip. Safe to re-run: everything is ON CONFLICT
-- DO NOTHING keyed on the fixed id.
--
-- §10 claims this configuration "reproduces every edge case in §9 without
-- further setup". Two mapping choices below are what make that true:
--   * Classic Facial is performable by Sarah ONLY  -> test 4 (block Sarah,
--     assert no facial slots) works with no extra setup.
--   * 3 therapists but only 2 massage rooms        -> test 2 (resource
--     contention) works: book two massages at 10:00 and the third therapist
--     is free while no room is.
-- ---------------------------------------------------------------------------

-- ---------- business ----------
-- NOT HERE ANY MORE. The real business row lives in
-- supabase/migrations/0003_business.sql, because Supabase's GitHub integration
-- applies migrations to the hosted project and never applies this file. Apply
-- 0003 before this file; everything below references the business id it creates.

-- ---------- services (§10) ----------
insert into services (id, business_id, name, description, duration_minutes, turnaround_minutes, price_cents, sort_order) values
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-0000000000b1',
   'Full Body Massage',
   'A full-body Swedish massage to release tension from head to toe.',
   60, 15, 50000, 1),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-0000000000b1',
   'Back & Neck Massage',
   'Focused pressure work on the back, shoulders and neck.',
   30, 10, 28000, 2),
  ('00000000-0000-4000-8000-000000000053', '00000000-0000-4000-8000-0000000000b1',
   'Classic Facial',
   'Cleanse, exfoliate, steam and mask, finished with a moisturiser for your skin type.',
   45, 10, 35000, 3),
  ('00000000-0000-4000-8000-000000000054', '00000000-0000-4000-8000-0000000000b1',
   'Gel Manicure',
   'Shaping, cuticle work and a long-wear gel colour of your choice.',
   45, 5, 25000, 4),
  ('00000000-0000-4000-8000-000000000055', '00000000-0000-4000-8000-0000000000b1',
   'Pedicure',
   'A soak, scrub and nail tidy, finished with polish.',
   60, 10, 32000, 5)
on conflict (id) do nothing;

-- ---------- staff (§10: three therapists) ----------
insert into staff (id, business_id, name, active) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-0000000000b1', 'Sarah',  true),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-0000000000b1', 'Nomsa',  true),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-0000000000b1', 'Lerato', true)
on conflict (id) do nothing;

-- ---------- resources (§10) ----------
insert into resources (id, business_id, name, active) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-0000000000b1', 'Massage Room 1', true),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-0000000000b1', 'Massage Room 2', true),
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-0000000000b1', 'Pedicure Chair', true)
on conflict (id) do nothing;

-- ---------- which resources each service needs (§10) ----------
-- "Massage services require a massage room. Manicure requires nothing.
--  Pedicure requires the chair."
-- Either massage room satisfies a massage — that is the "any one of them"
-- semantics of service_resources.
insert into service_resources (service_id, resource_id) values
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000031'),
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000032'),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000031'),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000032'),
  ('00000000-0000-4000-8000-000000000055', '00000000-0000-4000-8000-000000000033')
on conflict do nothing;
-- Gel Manicure (…54) intentionally has no rows: it requires no resource.
-- Classic Facial (…53) likewise. §10 assigns rooms only to "massage services";
-- it does not place the facial in a room, so we do not invent one. If the
-- facial should occupy a room, add it here and nothing else changes.

-- ---------- who can perform what (§10) ----------
-- Sarah is the ONLY facial therapist — see header note, this is what makes
-- acceptance test 4 work against the seed as-is.
insert into staff_services (staff_id, service_id) values
  -- Sarah: everything, including the facial
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000051'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000052'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000053'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000054'),
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000055'),
  -- Nomsa: everything except the facial
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000051'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000052'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000054'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000055'),
  -- Lerato: everything except the facial
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000051'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000052'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000054'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000055')
on conflict do nothing;

-- ---------- working hours (§10) ----------
-- "Tue–Sat 09:00–17:00, Sat 09:00–14:00, closed Sun–Mon."
-- day_of_week: 0 = Sunday. Tue=2 Wed=3 Thu=4 Fri=5 Sat=6.
-- No rows for Sunday(0) or Monday(1) — absence of a row IS closed.
--
-- THESE ARE THE SPEC'S FIXTURE HOURS, NOT THE REAL ONES.
-- The §9 acceptance tests are pinned to this configuration — §10 claims it
-- "reproduces every edge case in §9 without further setup", and it does. The
-- real profile is open seven days until 20:00, which would break the closed-day
-- and end-of-window assertions.
-- supabase/seed-real-hours.sql replaces these with the real week for LOCAL work,
-- applied on top by `npm run db:migrate --with-sample-data`. The test suite
-- applies this file only, so the §9 assertions stay pinned to the fixture.
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, d.dow, '09:00'::time, '17:00'::time
from staff s
cross join (values (2), (3), (4), (5)) as d(dow)
where s.business_id = '00000000-0000-4000-8000-0000000000b1'
  and not exists (
    select 1 from working_hours wh
    where wh.staff_id = s.id and wh.day_of_week = d.dow
  );

insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, 6, '09:00'::time, '14:00'::time
from staff s
where s.business_id = '00000000-0000-4000-8000-0000000000b1'
  and not exists (
    select 1 from working_hours wh
    where wh.staff_id = s.id and wh.day_of_week = 6
  );

-- ---------- owner account ----------
-- Create the owner in Supabase Auth (Dashboard > Authentication > Add user),
-- then link that user to this business so the §7 policies grant admin access:
--
--   insert into business_members (user_id, business_id)
--   values ('<auth-user-uuid>', '00000000-0000-4000-8000-0000000000b1');
--
-- Until that row exists, a logged-in user sees nothing. That is the policy
-- doing its job, not a bug.

-- ---------------------------------------------------------------------------
-- Real opening hours for Smart Nails and Beauty Spa.
--
-- ⚠ LOCAL DEVELOPMENT ONLY — this does NOT reach the hosted project.
-- It sets hours for the SAMPLE therapists created by seed.sql, so that a local
-- database behaves like the real week. Supabase's GitHub integration applies
-- only supabase/migrations/*.sql, and the real therapists do not exist yet
-- anyway: working_hours rows hang off staff, so real hours cannot be seeded
-- until the real therapists are known. Set them in Admin > Setup, which writes
-- the same rows through the §7.1 guards.
--
-- (This file was called seed-production.sql, which was misleading — it never
-- went anywhere near production.)
--
-- WHY IT IS SEPARATE FROM seed.sql
-- seed.sql carries spec §10's fixture hours (Tue–Sat, closing 17:00), and the
-- §9 acceptance tests are pinned to them: §10 claims that configuration
-- reproduces every edge case in §9 without further setup, and it does. The real
-- week is open seven days until 20:00, with no closed weekday and a later last
-- bookable slot, so folding it into seed.sql would break those assertions.
--
-- FROM THE GOOGLE BUSINESS PROFILE
--   Monday     9 am – 8 pm    (listed with "National Women's Day (Observed)")
--   Tuesday    9 am – 8 pm
--   Wednesday  9 am – 8 pm
--   Thursday   9 am – 8 pm
--   Friday     9 am – 8 pm
--   Saturday   9 am – 8 pm
--   Sunday     9 am – 4 pm    (listed with "National Women's Day")
--
-- ⚠ CONFIRM SUNDAY AND MONDAY BEFORE GOING LIVE.
-- Google showed both flagged "Hours might differ" because 9 August is National
-- Women's Day and 10 August is the observed public holiday. Those two rows may
-- therefore be holiday-adjusted rather than the regular week. Monday matches
-- every other weekday so it is very likely correct; Sunday's shorter 9–4 is the
-- one to check. If Sunday is normally closed, delete the Sunday insert below —
-- an absent row IS closed, and nothing else needs changing.
--
-- Public holidays are NOT modelled here. They belong in availability_blocks
-- (Admin > Block), which is what §3 provides that table for.
-- ---------------------------------------------------------------------------

begin;

-- Replace, never append: re-running must not leave yesterday's hours behind.
delete from working_hours
where staff_id in (
  select id from staff where business_id = '00000000-0000-4000-8000-0000000000b1'
);

-- Monday(1) to Saturday(6): 08:00–20:00
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, d.dow, '08:00'::time, '20:00'::time
from staff s
cross join (values (1), (2), (3), (4), (5), (6)) as d(dow)
where s.business_id = '00000000-0000-4000-8000-0000000000b1';

-- Sunday(0): 09:00–16:00. Delete this statement if Sunday is actually closed.
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, 0, '09:00'::time, '16:00'::time
from staff s
where s.business_id = '00000000-0000-4000-8000-0000000000b1';

commit;

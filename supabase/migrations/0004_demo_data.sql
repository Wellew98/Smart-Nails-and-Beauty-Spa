-- ---------------------------------------------------------------------------
-- DEMO DATA — placeholder treatments, therapists and rooms.
--
-- ⚠ NONE OF THIS CAME FROM THE BUSINESS. It exists so the site can be shown to
-- the owner before her real menu and staff list arrive. Every row is a stand-in.
--
-- While any of these rows exist, the site renders a visible banner on every page
-- saying the menu is a sample. That banner is driven by the `dddddddd-` id
-- prefix below, so it disappears by itself the moment these rows are gone —
-- there is no flag to remember to switch off. See lib/public-data.ts.
--
-- TO REMOVE, once the real data is in:
--
--     npm run db:demo-clear                     # local
--     npm run db:demo-clear -- "<connection>"   # hosted project
--
-- Or by hand: delete from services / staff / resources where the id starts
-- 'dddddddd-'. Deletion fails loudly if a real booking already references a
-- demo treatment — the foreign keys are NO ACTION on purpose (§7.1) — in which
-- case deactivate instead of deleting.
--
-- Hours below ARE real: Mon–Sat 08:00–20:00 and Sun 09:00–16:00, taken from
-- the studio's own printed price flyer. Only the menu durations and the people
-- are provisional.
-- ---------------------------------------------------------------------------

-- ---------- treatments (placeholder menu for a nail salon) ----------
insert into services (id, business_id, name, description, duration_minutes, turnaround_minutes, price_cents, sort_order) values
  ('dddddddd-dddd-4ddd-8ddd-000000000001', '00000000-0000-4000-8000-0000000000b1',
   'Gel Manicure',
   'Shaping, cuticle work and a long-wear gel colour of your choice.',
   45, 10, 32000, 1),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', '00000000-0000-4000-8000-0000000000b1',
   'Express Manicure',
   'A tidy, shape and buff when you are short on time.',
   30, 5, 18000, 2),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', '00000000-0000-4000-8000-0000000000b1',
   'Acrylic Full Set',
   'A full set of acrylic extensions, shaped and finished in the colour you pick.',
   90, 15, 48000, 3),
  ('dddddddd-dddd-4ddd-8ddd-000000000004', '00000000-0000-4000-8000-0000000000b1',
   'Pedicure',
   'A soak, scrub and nail tidy, finished with polish.',
   60, 10, 35000, 4),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', '00000000-0000-4000-8000-0000000000b1',
   'Gel Pedicure',
   'The full pedicure, finished with gel for a colour that lasts.',
   75, 10, 42000, 5),
  ('dddddddd-dddd-4ddd-8ddd-000000000006', '00000000-0000-4000-8000-0000000000b1',
   'Classic Facial',
   'Cleanse, exfoliate, steam and mask, finished for your skin type.',
   45, 10, 38000, 6)
on conflict (id) do nothing;

-- ---------- therapists (placeholder names) ----------
insert into staff (id, business_id, name, active) values
  ('dddddddd-dddd-4ddd-8ddd-000000000021', '00000000-0000-4000-8000-0000000000b1', 'Naledi',   true),
  ('dddddddd-dddd-4ddd-8ddd-000000000022', '00000000-0000-4000-8000-0000000000b1', 'Precious', true),
  ('dddddddd-dddd-4ddd-8ddd-000000000023', '00000000-0000-4000-8000-0000000000b1', 'Zanele',   true)
on conflict (id) do nothing;

-- ---------- rooms and equipment (placeholder) ----------
insert into resources (id, business_id, name, active) values
  ('dddddddd-dddd-4ddd-8ddd-000000000031', '00000000-0000-4000-8000-0000000000b1', 'Pedicure Chair 1', true),
  ('dddddddd-dddd-4ddd-8ddd-000000000032', '00000000-0000-4000-8000-0000000000b1', 'Pedicure Chair 2', true),
  ('dddddddd-dddd-4ddd-8ddd-000000000033', '00000000-0000-4000-8000-0000000000b1', 'Treatment Room',   true)
on conflict (id) do nothing;

-- ---------- what each treatment needs ----------
-- Pedicures need a chair (either one). The facial needs the treatment room.
-- Manicures and acrylics need nothing, which is why they have no rows here —
-- an empty set means "no resource required" (§3), and that is correct for work
-- done at the nail desk.
insert into service_resources (service_id, resource_id) values
  ('dddddddd-dddd-4ddd-8ddd-000000000004', 'dddddddd-dddd-4ddd-8ddd-000000000031'),
  ('dddddddd-dddd-4ddd-8ddd-000000000004', 'dddddddd-dddd-4ddd-8ddd-000000000032'),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', 'dddddddd-dddd-4ddd-8ddd-000000000031'),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', 'dddddddd-dddd-4ddd-8ddd-000000000032'),
  ('dddddddd-dddd-4ddd-8ddd-000000000006', 'dddddddd-dddd-4ddd-8ddd-000000000033')
on conflict do nothing;

-- ---------- who performs what ----------
-- Everyone does nails. The facial is Zanele only, which also demonstrates the
-- "one therapist for this treatment" case on the treatments page.
insert into staff_services (staff_id, service_id)
select s.id, sv.id
from staff s
cross join services sv
where s.id::text like 'dddddddd-%'
  and sv.id::text like 'dddddddd-%'
  and sv.id <> 'dddddddd-dddd-4ddd-8ddd-000000000006'
on conflict do nothing;

insert into staff_services (staff_id, service_id) values
  ('dddddddd-dddd-4ddd-8ddd-000000000023', 'dddddddd-dddd-4ddd-8ddd-000000000006')
on conflict do nothing;

-- ---------- working hours (REAL, from the flyer) ----------
-- Mon(1)–Sat(6) 08:00–20:00, Sun(0) 09:00–16:00. Printed on the studio's own
-- price flyer, so these survive when the demo menu is cleared out —
-- db:demo-clear removes the demo staff and their hours go with them, but the
-- real therapists should be given the same week.
insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, d.dow, '08:00'::time, '20:00'::time
from staff s
cross join (values (1), (2), (3), (4), (5), (6)) as d(dow)
where s.id::text like 'dddddddd-%'
  and not exists (
    select 1 from working_hours wh where wh.staff_id = s.id and wh.day_of_week = d.dow
  );

insert into working_hours (staff_id, day_of_week, start_time, end_time)
select s.id, 0, '09:00'::time, '16:00'::time
from staff s
where s.id::text like 'dddddddd-%'
  and not exists (
    select 1 from working_hours wh where wh.staff_id = s.id and wh.day_of_week = 0
  );

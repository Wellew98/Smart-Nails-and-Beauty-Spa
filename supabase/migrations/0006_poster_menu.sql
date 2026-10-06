-- ---------------------------------------------------------------------------
-- The menu from the studio's own printed price flyer.
--
-- Source: `docs/source-material/smart-price-menu.webp`, supplied by the owner
-- and transcribed line by line against the image. Names and PRICES come from
-- that flyer and are the studio's own.
--
-- ⚠ THE DURATIONS DO NOT. The flyer states a length only for the three
-- one-hour massages, and `duration_minutes` is `not null` because §6 builds
-- the entire availability grid out of it. So every other length below is an
-- ESTIMATE made to get the menu usable while the owner is asked, and a wrong
-- one does not fail loudly — it produces appointments that overlap in real
-- life while looking perfectly correct in the diary. Turnaround, the room and
-- chair mapping, and who performs what are estimates for the same reason.
--
-- THAT IS WHY THESE ROWS KEEP THE `dddddddd-` PREFIX even though the names
-- and prices are real. The prefix is what `lib/public-data.ts` looks for, so
-- the sample-menu banner keeps showing on every page and
-- `npm run db:demo-clear` still removes them. Over-warning is the safe
-- direction: a customer sees a notice that the menu is provisional, which it
-- is, because the times attached to it were guessed.
--
-- WHEN THE OWNER CONFIRMS: correct the durations here (or in Admin → Setup),
-- then re-issue these rows with ordinary uuids so the banner clears. Confirm
-- at the same time that the flyer is current and which number takes WhatsApp —
-- the business row assumes the voice line (081 044 4429) does both.
--
-- The six invented treatments from 0004 are DEACTIVATED below, not deleted: a
-- real booking may already reference one, the foreign keys are NO ACTION on
-- purpose (§7.1), and a past appointment must keep resolving at the price it
-- was made at.
-- ---------------------------------------------------------------------------

-- ---------- retire the invented menu from 0004 ----------
update services
   set active = false
 where business_id = '00000000-0000-4000-8000-0000000000b1'
   and id in (
     'dddddddd-dddd-4ddd-8ddd-000000000001',
     'dddddddd-dddd-4ddd-8ddd-000000000002',
     'dddddddd-dddd-4ddd-8ddd-000000000003',
     'dddddddd-dddd-4ddd-8ddd-000000000004',
     'dddddddd-dddd-4ddd-8ddd-000000000005',
     'dddddddd-dddd-4ddd-8ddd-000000000006'
   );

-- ---------- the flyer's services ----------
--
-- `description` carries the flyer's own category and nothing else. The site
-- copy rule in lib/site.ts allows only claims that are checkable against a
-- source, and there is no blurb for any of these — inventing one would be
-- exactly the class of copy that rule exists to keep out.
--
-- Durations are rounded to the 15-minute booking grid (§6) so slots line up.
insert into services (id, business_id, name, description, duration_minutes, turnaround_minutes, price_cents, sort_order) values
  -- Special package
  ('dddddddd-dddd-4ddd-8ddd-000000000101', '00000000-0000-4000-8000-0000000000b1', 'Massage + Facial + Pedicure',               'Special package',   150, 15, 50000, 101),
  ('dddddddd-dddd-4ddd-8ddd-000000000102', '00000000-0000-4000-8000-0000000000b1', 'Full Body Offer (Arms, Underarms, Bikini, Half Legs)', 'Special package', 120, 15, 70000, 102),

  -- Nails
  ('dddddddd-dddd-4ddd-8ddd-000000000103', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Overlay Gel',    'Nails',  90, 10, 25000, 103),
  ('dddddddd-dddd-4ddd-8ddd-000000000104', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Tips Gel',        'Nails',  90, 10, 30000, 104),
  ('dddddddd-dddd-4ddd-8ddd-000000000105', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Ombre Tips',      'Nails', 105, 15, 35000, 105),
  ('dddddddd-dddd-4ddd-8ddd-000000000106', '00000000-0000-4000-8000-0000000000b1', 'Acrylic French Tips',     'Nails',  90, 10, 30000, 106),
  ('dddddddd-dddd-4ddd-8ddd-000000000107', '00000000-0000-4000-8000-0000000000b1', 'Short Gel Tips',          'Nails',  90, 10, 38000, 107),
  ('dddddddd-dddd-4ddd-8ddd-000000000108', '00000000-0000-4000-8000-0000000000b1', 'Sculpture',               'Nails', 120, 15, 38000, 108),
  ('dddddddd-dddd-4ddd-8ddd-000000000109', '00000000-0000-4000-8000-0000000000b1', 'Back Fill',               'Nails',  75, 10, 25000, 109),
  ('dddddddd-dddd-4ddd-8ddd-000000000110', '00000000-0000-4000-8000-0000000000b1', 'Normal Polish (Hands)',   'Nails',  30,  5, 10000, 110),
  ('dddddddd-dddd-4ddd-8ddd-000000000111', '00000000-0000-4000-8000-0000000000b1', 'Normal Polish (Feet)',    'Nails',  30,  5, 10000, 111),

  -- Massage. The three one-hour lines ARE the durations the flyer states.
  ('dddddddd-dddd-4ddd-8ddd-000000000112', '00000000-0000-4000-8000-0000000000b1', 'Full Body Swedish (1 hr)', 'Massage', 60, 15, 40000, 112),
  ('dddddddd-dddd-4ddd-8ddd-000000000113', '00000000-0000-4000-8000-0000000000b1', 'Sport Massage (1 hr)',      'Massage', 60, 15, 40000, 113),
  ('dddddddd-dddd-4ddd-8ddd-000000000114', '00000000-0000-4000-8000-0000000000b1', 'Aromatic Massage (1 hr)',   'Massage', 60, 15, 38000, 114),
  ('dddddddd-dddd-4ddd-8ddd-000000000115', '00000000-0000-4000-8000-0000000000b1', 'Neck & Shoulder',           'Massage', 30, 10, 20000, 115),
  ('dddddddd-dddd-4ddd-8ddd-000000000116', '00000000-0000-4000-8000-0000000000b1', 'Foot Massage',              'Massage', 30, 10, 20000, 116),
  ('dddddddd-dddd-4ddd-8ddd-000000000117', '00000000-0000-4000-8000-0000000000b1', 'Hot Stone',                 'Massage', 60, 15, 40000, 117),

  -- Eyelash extensions
  ('dddddddd-dddd-4ddd-8ddd-000000000118', '00000000-0000-4000-8000-0000000000b1', 'Classic',       'Eyelash extensions', 120, 15, 35000, 118),
  ('dddddddd-dddd-4ddd-8ddd-000000000119', '00000000-0000-4000-8000-0000000000b1', 'Volume',        'Eyelash extensions', 150, 15, 45000, 119),
  ('dddddddd-dddd-4ddd-8ddd-000000000120', '00000000-0000-4000-8000-0000000000b1', '2 Weeks Fill',  'Eyelash extensions',  60, 10, 20000, 120),
  ('dddddddd-dddd-4ddd-8ddd-000000000121', '00000000-0000-4000-8000-0000000000b1', 'Lash Removal',  'Eyelash extensions',  30,  5, 10000, 121),

  -- Gel application
  ('dddddddd-dddd-4ddd-8ddd-000000000122', '00000000-0000-4000-8000-0000000000b1', 'Gel Hands',         'Gel',  60, 10, 20000, 122),
  ('dddddddd-dddd-4ddd-8ddd-000000000123', '00000000-0000-4000-8000-0000000000b1', 'Gel Feet',          'Gel',  60, 10, 20000, 123),
  ('dddddddd-dddd-4ddd-8ddd-000000000124', '00000000-0000-4000-8000-0000000000b1', 'Bio Sculpture Gel', 'Gel',  90, 10, 30000, 124),
  ('dddddddd-dddd-4ddd-8ddd-000000000125', '00000000-0000-4000-8000-0000000000b1', 'Ply Gel',           'Gel',  90, 10, 30000, 125),

  -- Women waxing
  ('dddddddd-dddd-4ddd-8ddd-000000000126', '00000000-0000-4000-8000-0000000000b1', 'Eyebrows',   'Women waxing', 15,  5, 10000, 126),
  ('dddddddd-dddd-4ddd-8ddd-000000000127', '00000000-0000-4000-8000-0000000000b1', 'Forehead',   'Women waxing', 15,  5, 10000, 127),
  ('dddddddd-dddd-4ddd-8ddd-000000000128', '00000000-0000-4000-8000-0000000000b1', 'Chin',       'Women waxing', 15,  5, 10000, 128),
  ('dddddddd-dddd-4ddd-8ddd-000000000129', '00000000-0000-4000-8000-0000000000b1', 'Neck',       'Women waxing', 15,  5, 12000, 129),
  ('dddddddd-dddd-4ddd-8ddd-000000000130', '00000000-0000-4000-8000-0000000000b1', 'Face Sides', 'Women waxing', 15,  5, 15000, 130),
  ('dddddddd-dddd-4ddd-8ddd-000000000131', '00000000-0000-4000-8000-0000000000b1', 'Upper Lip',  'Women waxing', 15,  5, 10000, 131),
  ('dddddddd-dddd-4ddd-8ddd-000000000132', '00000000-0000-4000-8000-0000000000b1', 'Lower Lip',  'Women waxing', 15,  5, 10000, 132),
  ('dddddddd-dddd-4ddd-8ddd-000000000133', '00000000-0000-4000-8000-0000000000b1', 'Nose',       'Women waxing', 15,  5, 10000, 133),
  ('dddddddd-dddd-4ddd-8ddd-000000000134', '00000000-0000-4000-8000-0000000000b1', 'Ears',       'Women waxing', 15,  5, 10000, 134),

  -- Body waxing
  ('dddddddd-dddd-4ddd-8ddd-000000000135', '00000000-0000-4000-8000-0000000000b1', 'Full Face',     'Body waxing', 30,  5, 18000, 135),
  ('dddddddd-dddd-4ddd-8ddd-000000000136', '00000000-0000-4000-8000-0000000000b1', 'Underarms',     'Body waxing', 15,  5, 15000, 136),
  ('dddddddd-dddd-4ddd-8ddd-000000000137', '00000000-0000-4000-8000-0000000000b1', 'Half Arms',     'Body waxing', 30,  5, 12000, 137),
  ('dddddddd-dddd-4ddd-8ddd-000000000138', '00000000-0000-4000-8000-0000000000b1', 'Full Arms',     'Body waxing', 30,  5, 15000, 138),
  ('dddddddd-dddd-4ddd-8ddd-000000000139', '00000000-0000-4000-8000-0000000000b1', 'Half Legs',     'Body waxing', 30,  5, 15000, 139),
  ('dddddddd-dddd-4ddd-8ddd-000000000140', '00000000-0000-4000-8000-0000000000b1', 'Full Legs',     'Body waxing', 45, 10, 18000, 140),
  ('dddddddd-dddd-4ddd-8ddd-000000000141', '00000000-0000-4000-8000-0000000000b1', 'Full Back',     'Body waxing', 45, 10, 20000, 141),
  ('dddddddd-dddd-4ddd-8ddd-000000000142', '00000000-0000-4000-8000-0000000000b1', 'Bikini Line',   'Body waxing', 30, 10, 18000, 142),
  ('dddddddd-dddd-4ddd-8ddd-000000000143', '00000000-0000-4000-8000-0000000000b1', 'Full Bikini',   'Body waxing', 30, 10, 18000, 143),
  ('dddddddd-dddd-4ddd-8ddd-000000000144', '00000000-0000-4000-8000-0000000000b1', 'Shape & Tint',  'Body waxing', 30,  5, 15000, 144),

  -- Pedicure
  ('dddddddd-dddd-4ddd-8ddd-000000000145', '00000000-0000-4000-8000-0000000000b1', 'Full Pedi + Gel',          'Pedicure', 75, 10, 30000, 145),
  ('dddddddd-dddd-4ddd-8ddd-000000000146', '00000000-0000-4000-8000-0000000000b1', 'Full Pedi + Normal Paint', 'Pedicure', 60, 10, 25000, 146),
  ('dddddddd-dddd-4ddd-8ddd-000000000147', '00000000-0000-4000-8000-0000000000b1', 'Full Pedi (No Paint)',     'Pedicure', 45, 10, 22000, 147),
  ('dddddddd-dddd-4ddd-8ddd-000000000148', '00000000-0000-4000-8000-0000000000b1', 'Paraffin Deep',            'Pedicure', 30,  5, 10000, 148),

  -- Men services
  ('dddddddd-dddd-4ddd-8ddd-000000000149', '00000000-0000-4000-8000-0000000000b1', 'Full Pedicure (Men)', 'Men services', 60, 10, 25000, 149),
  ('dddddddd-dddd-4ddd-8ddd-000000000150', '00000000-0000-4000-8000-0000000000b1', 'Full Manicure (Men)', 'Men services', 60, 10, 25000, 150),
  ('dddddddd-dddd-4ddd-8ddd-000000000151', '00000000-0000-4000-8000-0000000000b1', 'Buff & Shine',        'Men services', 30,  5, 15000, 151),

  -- Facials
  ('dddddddd-dddd-4ddd-8ddd-000000000152', '00000000-0000-4000-8000-0000000000b1', 'Hydrating Facial',   'Facials', 60, 15, 35000, 152),
  ('dddddddd-dddd-4ddd-8ddd-000000000153', '00000000-0000-4000-8000-0000000000b1', 'Deep Cleanse Facial', 'Facials', 60, 15, 30000, 153),
  ('dddddddd-dddd-4ddd-8ddd-000000000154', '00000000-0000-4000-8000-0000000000b1', 'Anti-Aging Facial',   'Facials', 60, 15, 40000, 154)
on conflict (id) do nothing;

-- ---------- who performs what ----------
-- Every therapist is mapped to every treatment, because the flyer says nothing
-- about who does what and a service with NO staff row returns zero slots
-- forever — it would appear on the menu and be permanently unbookable, which
-- is worse than a provisional guess. The therapists themselves are still
-- placeholders until the owner names her team in Admin → Setup.
insert into staff_services (staff_id, service_id)
select st.id, s.id
  from staff st
  cross join services s
 where st.business_id = '00000000-0000-4000-8000-0000000000b1'
   and st.id::text like 'dddddddd-%'
   and s.id::text like 'dddddddd-dddd-4ddd-8ddd-0000000001%'
on conflict do nothing;

-- ---------- what needs a room or a chair ----------
-- An estimate, and the one most likely to be wrong. Pedicures need a chair and
-- anything a guest lies down for needs the room; everything else is done at
-- the nail desk, which is not modelled as a resource (§3: an empty set means
-- "no resource required" and is correct here, not an oversight).
insert into service_resources (service_id, resource_id)
select s.id, r.id
  from services s
  cross join resources r
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000111',  -- Normal Polish (Feet)
         'dddddddd-dddd-4ddd-8ddd-000000000145',  -- Full Pedi + Gel
         'dddddddd-dddd-4ddd-8ddd-000000000146',  -- Full Pedi + Normal Paint
         'dddddddd-dddd-4ddd-8ddd-000000000147',  -- Full Pedi (No Paint)
         'dddddddd-dddd-4ddd-8ddd-000000000122',  -- Gel Hands
         'dddddddd-dddd-4ddd-8ddd-000000000123'   -- Gel Feet
       )
   and r.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000031',
         'dddddddd-dddd-4ddd-8ddd-000000000032'
       )
on conflict do nothing;

-- Massages, facials, specials and waxing are done lying down, in the
-- treatment room.
insert into service_resources (service_id, resource_id)
select s.id, 'dddddddd-dddd-4ddd-8ddd-000000000033'::uuid
  from services s
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000101',  -- Massage + Facial + Pedicure
         'dddddddd-dddd-4ddd-8ddd-000000000102',  -- Full Body Offer
         'dddddddd-dddd-4ddd-8ddd-000000000112',  -- Full Body Swedish
         'dddddddd-dddd-4ddd-8ddd-000000000113',  -- Sport Massage
         'dddddddd-dddd-4ddd-8ddd-000000000114',  -- Aromatic Massage
         'dddddddd-dddd-4ddd-8ddd-000000000115',  -- Neck & Shoulder
         'dddddddd-dddd-4ddd-8ddd-000000000116',  -- Foot Massage
         'dddddddd-dddd-4ddd-8ddd-000000000117',  -- Hot Stone
         'dddddddd-dddd-4ddd-8ddd-000000000118',  -- Classic lashes
         'dddddddd-dddd-4ddd-8ddd-000000000119',  -- Volume lashes
         'dddddddd-dddd-4ddd-8ddd-000000000120',  -- 2 Weeks Fill
         'dddddddd-dddd-4ddd-8ddd-000000000121',  -- Lash Removal
         'dddddddd-dddd-4ddd-8ddd-000000000135',  -- Full Face
         'dddddddd-dddd-4ddd-8ddd-000000000136',  -- Underarms
         'dddddddd-dddd-4ddd-8ddd-000000000137',  -- Half Arms
         'dddddddd-dddd-4ddd-8ddd-000000000138',  -- Full Arms
         'dddddddd-dddd-4ddd-8ddd-000000000139',  -- Half Legs
         'dddddddd-dddd-4ddd-8ddd-000000000140',  -- Full Legs
         'dddddddd-dddd-4ddd-8ddd-000000000141',  -- Full Back
         'dddddddd-dddd-4ddd-8ddd-000000000142',  -- Bikini Line
         'dddddddd-dddd-4ddd-8ddd-000000000143',  -- Full Bikini
         'dddddddd-dddd-4ddd-8ddd-000000000152',  -- Hydrating Facial
         'dddddddd-dddd-4ddd-8ddd-000000000153',  -- Deep Cleanse Facial
         'dddddddd-dddd-4ddd-8ddd-000000000154'   -- Anti-Aging Facial
       )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Updated menu from the studio's new printed price flyer (Oct 2026).
--
-- Source: `docs/source-material/price-list-oct-2026.png`, supplied by the
-- owner. Transcribed line by line against the image. Names and PRICES below
-- are the flyer's own.
--
-- This replaces the 54-service menu from `0006_poster_menu.sql` (source:
-- `docs/source-material/smart-price-menu.webp`), which the new flyer
-- supersedes. The old rows are DEACTIVATED, not deleted: a real booking may
-- already reference one, the foreign keys are NO ACTION on purpose (§7.1),
-- and a past appointment must keep resolving at the price it was made at.
--
-- ⚠ THE DURATIONS DO NOT COME FROM THE FLYER. The flyer states a length
-- only for "Full Body Massage - 90 min", and `duration_minutes` is `not
-- null` because §6 builds the entire availability grid out of it. So every
-- other length below is an ESTIMATE, rounded to the 15-minute booking grid.
-- A wrong duration does not fail loudly: it produces appointments that
-- overlap in real life while looking perfectly correct in the diary.
--
-- THAT IS WHY THESE ROWS KEEP THE `dddddddd-` PREFIX even though the names
-- and prices are real. The prefix is what the site looks for, so the
-- sample-menu banner keeps showing on every page. Over-warning is the safe
-- direction: a customer sees a notice that the menu is provisional, which
-- it is, because the times attached to it were guessed.
--
-- WHEN THE OWNER CONFIRMS: correct the durations here (or in Admin → Setup),
-- then re-issue these rows with ordinary uuids so the banner clears.
--
-- Deduplication note: the flyer lists "Gel Pedicure R350" under both NAILS
-- and PEDICURE, and "Buff & Shine R150" under both. Each exists ONCE below
-- (Gel Pedicure as Pedicure, Buff & Shine as Nails) — two rows with the
-- same name would show as confusing duplicates in /book.
-- ---------------------------------------------------------------------------

-- ---------- retire the previous flyer menu from 0006 ----------
update services
   set active = false
 where business_id = '00000000-0000-4000-8000-0000000000b1'
   and id in (
     'dddddddd-dddd-4ddd-8ddd-000000000101',
     'dddddddd-dddd-4ddd-8ddd-000000000102',
     'dddddddd-dddd-4ddd-8ddd-000000000103',
     'dddddddd-dddd-4ddd-8ddd-000000000104',
     'dddddddd-dddd-4ddd-8ddd-000000000105',
     'dddddddd-dddd-4ddd-8ddd-000000000106',
     'dddddddd-dddd-4ddd-8ddd-000000000107',
     'dddddddd-dddd-4ddd-8ddd-000000000108',
     'dddddddd-dddd-4ddd-8ddd-000000000109',
     'dddddddd-dddd-4ddd-8ddd-000000000110',
     'dddddddd-dddd-4ddd-8ddd-000000000111',
     'dddddddd-dddd-4ddd-8ddd-000000000112',
     'dddddddd-dddd-4ddd-8ddd-000000000113',
     'dddddddd-dddd-4ddd-8ddd-000000000114',
     'dddddddd-dddd-4ddd-8ddd-000000000115',
     'dddddddd-dddd-4ddd-8ddd-000000000116',
     'dddddddd-dddd-4ddd-8ddd-000000000117',
     'dddddddd-dddd-4ddd-8ddd-000000000118',
     'dddddddd-dddd-4ddd-8ddd-000000000119',
     'dddddddd-dddd-4ddd-8ddd-000000000120',
     'dddddddd-dddd-4ddd-8ddd-000000000121',
     'dddddddd-dddd-4ddd-8ddd-000000000122',
     'dddddddd-dddd-4ddd-8ddd-000000000123',
     'dddddddd-dddd-4ddd-8ddd-000000000124',
     'dddddddd-dddd-4ddd-8ddd-000000000125',
     'dddddddd-dddd-4ddd-8ddd-000000000126',
     'dddddddd-dddd-4ddd-8ddd-000000000127',
     'dddddddd-dddd-4ddd-8ddd-000000000128',
     'dddddddd-dddd-4ddd-8ddd-000000000129',
     'dddddddd-dddd-4ddd-8ddd-000000000130',
     'dddddddd-dddd-4ddd-8ddd-000000000131',
     'dddddddd-dddd-4ddd-8ddd-000000000132',
     'dddddddd-dddd-4ddd-8ddd-000000000133',
     'dddddddd-dddd-4ddd-8ddd-000000000134',
     'dddddddd-dddd-4ddd-8ddd-000000000135',
     'dddddddd-dddd-4ddd-8ddd-000000000136',
     'dddddddd-dddd-4ddd-8ddd-000000000137',
     'dddddddd-dddd-4ddd-8ddd-000000000138',
     'dddddddd-dddd-4ddd-8ddd-000000000139',
     'dddddddd-dddd-4ddd-8ddd-000000000140',
     'dddddddd-dddd-4ddd-8ddd-000000000141',
     'dddddddd-dddd-4ddd-8ddd-000000000142',
     'dddddddd-dddd-4ddd-8ddd-000000000143',
     'dddddddd-dddd-4ddd-8ddd-000000000144',
     'dddddddd-dddd-4ddd-8ddd-000000000145',
     'dddddddd-dddd-4ddd-8ddd-000000000146',
     'dddddddd-dddd-4ddd-8ddd-000000000147',
     'dddddddd-dddd-4ddd-8ddd-000000000148',
     'dddddddd-dddd-4ddd-8ddd-000000000149',
     'dddddddd-dddd-4ddd-8ddd-000000000150',
     'dddddddd-dddd-4ddd-8ddd-000000000151',
     'dddddddd-dddd-4ddd-8ddd-000000000152',
     'dddddddd-dddd-4ddd-8ddd-000000000153',
     'dddddddd-dddd-4ddd-8ddd-000000000154'
   );

-- ---------- the new flyer's services ----------
--
-- `description` carries the flyer's own category and nothing else. The site
-- copy rule in lib/site.ts allows only claims that are checkable against a
-- source, and there is no blurb for any of these — inventing one would be
-- exactly the class of copy that rule exists to keep out.
insert into services (id, business_id, name, description, duration_minutes, turnaround_minutes, price_cents, sort_order) values
  -- Makeup
  ('dddddddd-dddd-4ddd-8ddd-000000000201', '00000000-0000-4000-8000-0000000000b1', 'Makeup',      'Makeup',           60, 15, 55000, 201),

  -- Body treatments
  ('dddddddd-dddd-4ddd-8ddd-000000000202', '00000000-0000-4000-8000-0000000000b1', 'Body Scrub',  'Body treatments',  60, 15, 45000, 202),

  -- Pedicure
  ('dddddddd-dddd-4ddd-8ddd-000000000203', '00000000-0000-4000-8000-0000000000b1', 'Express Pedicure',                                    'Pedicure', 30,  5, 20000, 203),
  ('dddddddd-dddd-4ddd-8ddd-000000000204', '00000000-0000-4000-8000-0000000000b1', 'Full Pedicure Plus Gel',                              'Pedicure', 75, 10, 40000, 204),
  ('dddddddd-dddd-4ddd-8ddd-000000000205', '00000000-0000-4000-8000-0000000000b1', 'Smart Pedicure (Full Ped, Caviar, Paraffin Deep, Gel)', 'Pedicure', 90, 15, 50000, 205),
  ('dddddddd-dddd-4ddd-8ddd-000000000206', '00000000-0000-4000-8000-0000000000b1', 'Gel Pedicure',                                        'Pedicure', 75, 10, 35000, 206),

  -- Facials
  ('dddddddd-dddd-4ddd-8ddd-000000000207', '00000000-0000-4000-8000-0000000000b1', 'Classic Deep Cleansing Facial',       'Facials', 60, 15, 30000, 207),
  ('dddddddd-dddd-4ddd-8ddd-000000000208', '00000000-0000-4000-8000-0000000000b1', 'Relaxing Facial',                     'Facials', 60, 15, 30000, 208),
  ('dddddddd-dddd-4ddd-8ddd-000000000209', '00000000-0000-4000-8000-0000000000b1', 'Deep Cleansing & Extraction Facial',  'Facials', 75, 15, 50000, 209),
  ('dddddddd-dddd-4ddd-8ddd-000000000210', '00000000-0000-4000-8000-0000000000b1', 'Hydrating Facial',                    'Facials', 60, 15, 45000, 210),
  ('dddddddd-dddd-4ddd-8ddd-000000000211', '00000000-0000-4000-8000-0000000000b1', 'Anti-Aging Facial',                   'Facials', 60, 15, 45000, 211),
  ('dddddddd-dddd-4ddd-8ddd-000000000212', '00000000-0000-4000-8000-0000000000b1', 'Luxury Glow Facial',                  'Facials', 75, 15, 55000, 212),
  ('dddddddd-dddd-4ddd-8ddd-000000000213', '00000000-0000-4000-8000-0000000000b1', 'Men''s Facial',                       'Facials', 60, 15, 45000, 213),

  -- Nails
  ('dddddddd-dddd-4ddd-8ddd-000000000214', '00000000-0000-4000-8000-0000000000b1', 'Manicure',                    'Nails', 45, 10, 15000, 214),
  ('dddddddd-dddd-4ddd-8ddd-000000000215', '00000000-0000-4000-8000-0000000000b1', 'Gel Manicure',                'Nails', 60, 10, 25000, 215),
  ('dddddddd-dddd-4ddd-8ddd-000000000216', '00000000-0000-4000-8000-0000000000b1', 'Gel Hands & Feet Combo',      'Nails', 90, 10, 35000, 216),
  ('dddddddd-dddd-4ddd-8ddd-000000000217', '00000000-0000-4000-8000-0000000000b1', 'Buff & Shine',                'Nails', 30,  5, 15000, 217),
  ('dddddddd-dddd-4ddd-8ddd-000000000218', '00000000-0000-4000-8000-0000000000b1', 'Nail Shaping & Filing',       'Nails', 30,  5, 15000, 218),
  ('dddddddd-dddd-4ddd-8ddd-000000000219', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Full Set',            'Nails', 120, 15, 35000, 219),
  ('dddddddd-dddd-4ddd-8ddd-000000000220', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Overlay',             'Nails', 90, 10, 25000, 220),
  ('dddddddd-dddd-4ddd-8ddd-000000000221', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Fill/Refill',         'Nails', 75, 10, 20000, 221),
  ('dddddddd-dddd-4ddd-8ddd-000000000222', '00000000-0000-4000-8000-0000000000b1', 'Acrylic with Gel Colour',     'Nails', 90, 10, 20000, 222),
  ('dddddddd-dddd-4ddd-8ddd-000000000223', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Removal',             'Nails', 30,  5,  7000, 223),
  ('dddddddd-dddd-4ddd-8ddd-000000000224', '00000000-0000-4000-8000-0000000000b1', 'Gel Overlay',                 'Nails', 60, 10, 20000, 224),
  ('dddddddd-dddd-4ddd-8ddd-000000000225', '00000000-0000-4000-8000-0000000000b1', 'Gel Polish - Hands',          'Nails', 45,  5, 20000, 225),
  ('dddddddd-dddd-4ddd-8ddd-000000000226', '00000000-0000-4000-8000-0000000000b1', 'Gel Polish - Feet',           'Nails', 45,  5, 20000, 226),
  ('dddddddd-dddd-4ddd-8ddd-000000000227', '00000000-0000-4000-8000-0000000000b1', 'Gel Removal & Reapplication', 'Nails', 60, 10, 20000, 227),

  -- Massage. Only the 90-minute line states its length on the flyer.
  ('dddddddd-dddd-4ddd-8ddd-000000000228', '00000000-0000-4000-8000-0000000000b1', 'Full Body Massage',            'Massage', 60, 15, 45000, 228),
  ('dddddddd-dddd-4ddd-8ddd-000000000229', '00000000-0000-4000-8000-0000000000b1', 'Full Body Massage - 90 min',   'Massage', 90, 15, 60000, 229),
  ('dddddddd-dddd-4ddd-8ddd-000000000230', '00000000-0000-4000-8000-0000000000b1', 'Aromatherapy Massage',         'Massage', 60, 15, 45000, 230),
  ('dddddddd-dddd-4ddd-8ddd-000000000231', '00000000-0000-4000-8000-0000000000b1', 'Deep Tissue Massage',          'Massage', 60, 15, 50000, 231),
  ('dddddddd-dddd-4ddd-8ddd-000000000232', '00000000-0000-4000-8000-0000000000b1', 'Back, Neck & Shoulder Massage','Massage', 30, 10, 20000, 232),
  ('dddddddd-dddd-4ddd-8ddd-000000000233', '00000000-0000-4000-8000-0000000000b1', 'Hot Stone Massage',            'Massage', 75, 15, 55000, 233),
  ('dddddddd-dddd-4ddd-8ddd-000000000234', '00000000-0000-4000-8000-0000000000b1', 'Couples Massage',              'Massage', 60, 15, 60000, 234),

  -- Lashes
  ('dddddddd-dddd-4ddd-8ddd-000000000235', '00000000-0000-4000-8000-0000000000b1', 'Lashes Classic Full Set', 'Lashes', 120, 15, 35000, 235),
  ('dddddddd-dddd-4ddd-8ddd-000000000236', '00000000-0000-4000-8000-0000000000b1', 'Lashes Classic Refill',   'Lashes',  60, 10, 25000, 236),
  ('dddddddd-dddd-4ddd-8ddd-000000000237', '00000000-0000-4000-8000-0000000000b1', 'Hybrid Full Set',         'Lashes', 120, 15, 45000, 237),
  ('dddddddd-dddd-4ddd-8ddd-000000000238', '00000000-0000-4000-8000-0000000000b1', 'Hybrid Refill',           'Lashes',  60, 10, 30000, 238),
  ('dddddddd-dddd-4ddd-8ddd-000000000239', '00000000-0000-4000-8000-0000000000b1', 'Volume Full Set',         'Lashes', 150, 15, 50000, 239),
  ('dddddddd-dddd-4ddd-8ddd-000000000240', '00000000-0000-4000-8000-0000000000b1', 'Volume Refill',           'Lashes',  75, 10, 35000, 240),
  ('dddddddd-dddd-4ddd-8ddd-000000000241', '00000000-0000-4000-8000-0000000000b1', 'Lash Lift + Tint',         'Lashes',  75, 10, 30000, 241),
  ('dddddddd-dddd-4ddd-8ddd-000000000242', '00000000-0000-4000-8000-0000000000b1', 'Individual Lashes',       'Lashes', 120, 15, 40000, 242),
  ('dddddddd-dddd-4ddd-8ddd-000000000243', '00000000-0000-4000-8000-0000000000b1', 'Cluster Lashes',          'Lashes',  60, 10, 20000, 243),
  ('dddddddd-dddd-4ddd-8ddd-000000000244', '00000000-0000-4000-8000-0000000000b1', 'Lash Removal',            'Lashes',  30,  5, 15000, 244),

  -- Waxing
  ('dddddddd-dddd-4ddd-8ddd-000000000245', '00000000-0000-4000-8000-0000000000b1', 'Eyebrow Wax',                    'Waxing', 15,  5, 10000, 245),
  ('dddddddd-dddd-4ddd-8ddd-000000000246', '00000000-0000-4000-8000-0000000000b1', 'Upper Lip Wax',                  'Waxing', 15,  5, 10000, 246),
  ('dddddddd-dddd-4ddd-8ddd-000000000247', '00000000-0000-4000-8000-0000000000b1', 'Chin Wax',                       'Waxing', 15,  5, 10000, 247),
  ('dddddddd-dddd-4ddd-8ddd-000000000248', '00000000-0000-4000-8000-0000000000b1', 'Full Face Wax',                  'Waxing', 30,  5, 20000, 248),
  ('dddddddd-dddd-4ddd-8ddd-000000000249', '00000000-0000-4000-8000-0000000000b1', 'Underarm Wax',                   'Waxing', 15,  5, 18000, 249),
  ('dddddddd-dddd-4ddd-8ddd-000000000250', '00000000-0000-4000-8000-0000000000b1', 'Half Arm Wax',                    'Waxing', 30,  5, 15000, 250),
  ('dddddddd-dddd-4ddd-8ddd-000000000251', '00000000-0000-4000-8000-0000000000b1', 'Full Arm Wax',                     'Waxing', 30,  5, 20000, 251),
  ('dddddddd-dddd-4ddd-8ddd-000000000252', '00000000-0000-4000-8000-0000000000b1', 'Half Leg Wax',                    'Waxing', 30,  5, 18000, 252),
  ('dddddddd-dddd-4ddd-8ddd-000000000253', '00000000-0000-4000-8000-0000000000b1', 'Full Leg Wax',                     'Waxing', 45, 10, 18000, 253),
  ('dddddddd-dddd-4ddd-8ddd-000000000254', '00000000-0000-4000-8000-0000000000b1', 'Bikini Line',                      'Waxing', 30, 10, 25000, 254),
  ('dddddddd-dddd-4ddd-8ddd-000000000255', '00000000-0000-4000-8000-0000000000b1', 'Brazilian',                        'Waxing', 30, 10, 15000, 255),
  ('dddddddd-dddd-4ddd-8ddd-000000000256', '00000000-0000-4000-8000-0000000000b1', 'Full Back',                        'Waxing', 45, 10, 25000, 256),
  ('dddddddd-dddd-4ddd-8ddd-000000000257', '00000000-0000-4000-8000-0000000000b1', 'Full Body Wax',                    'Waxing', 120, 15, 65000, 257),
  ('dddddddd-dddd-4ddd-8ddd-000000000258', '00000000-0000-4000-8000-0000000000b1', 'Full Legs + Underarms + Bikini',   'Waxing', 75, 10, 45000, 258)
on conflict (id) do nothing;

-- ---------- who performs what ----------
-- Every therapist is mapped to every new treatment, because the flyer says
-- nothing about who does what and a service with NO staff row returns zero
-- slots forever — it would appear on the menu and be permanently
-- unbookable, which is worse than a provisional guess. The therapists
-- themselves are still placeholders until the owner names her team in
-- Admin → Setup.
insert into staff_services (staff_id, service_id)
select st.id, s.id
  from staff st
  cross join services s
 where st.business_id = '00000000-0000-4000-8000-0000000000b1'
   and st.id::text like 'dddddddd-%'
   and s.id::text like 'dddddddd-dddd-4ddd-8ddd-0000000002%'
on conflict do nothing;

-- ---------- what needs a room or a chair ----------
-- An estimate. Pedicures (and feet work) need a chair; anything a guest
-- lies down for needs the treatment room; everything else is done at the
-- nail or makeup desk, which is not modelled as a resource (§3: an empty
-- set means "no resource required" and is correct here, not an oversight).
insert into service_resources (service_id, resource_id)
select s.id, r.id
  from services s
  cross join resources r
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000203',  -- Express Pedicure
         'dddddddd-dddd-4ddd-8ddd-000000000204',  -- Full Pedicure Plus Gel
         'dddddddd-dddd-4ddd-8ddd-000000000205',  -- Smart Pedicure
         'dddddddd-dddd-4ddd-8ddd-000000000206',  -- Gel Pedicure
         'dddddddd-dddd-4ddd-8ddd-000000000216',  -- Gel Hands & Feet Combo
         'dddddddd-dddd-4ddd-8ddd-000000000226'   -- Gel Polish - Feet
       )
   and r.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000031',
         'dddddddd-dddd-4ddd-8ddd-000000000032'
       )
on conflict do nothing;

-- Body treatments, facials, massages, lashes and waxing are done lying
-- down, in the treatment room.
insert into service_resources (service_id, resource_id)
select s.id, 'dddddddd-dddd-4ddd-8ddd-000000000033'::uuid
  from services s
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000202',  -- Body Scrub
         'dddddddd-dddd-4ddd-8ddd-000000000207',  -- Classic Deep Cleansing
         'dddddddd-dddd-4ddd-8ddd-000000000208',  -- Relaxing Facial
         'dddddddd-dddd-4ddd-8ddd-000000000209',  -- Deep Cleansing & Extraction
         'dddddddd-dddd-4ddd-8ddd-000000000210',  -- Hydrating Facial
         'dddddddd-dddd-4ddd-8ddd-000000000211',  -- Anti-Aging Facial
         'dddddddd-dddd-4ddd-8ddd-000000000212',  -- Luxury Glow Facial
         'dddddddd-dddd-4ddd-8ddd-000000000213',  -- Men's Facial
         'dddddddd-dddd-4ddd-8ddd-000000000228',  -- Full Body Massage
         'dddddddd-dddd-4ddd-8ddd-000000000229',  -- Full Body Massage - 90 min
         'dddddddd-dddd-4ddd-8ddd-000000000230',  -- Aromatherapy Massage
         'dddddddd-dddd-4ddd-8ddd-000000000231',  -- Deep Tissue Massage
         'dddddddd-dddd-4ddd-8ddd-000000000232',  -- Back, Neck & Shoulder
         'dddddddd-dddd-4ddd-8ddd-000000000233',  -- Hot Stone Massage
         'dddddddd-dddd-4ddd-8ddd-000000000234',  -- Couples Massage
         'dddddddd-dddd-4ddd-8ddd-000000000235',  -- Lashes Classic Full Set
         'dddddddd-dddd-4ddd-8ddd-000000000236',  -- Lashes Classic Refill
         'dddddddd-dddd-4ddd-8ddd-000000000237',  -- Hybrid Full Set
         'dddddddd-dddd-4ddd-8ddd-000000000238',  -- Hybrid Refill
         'dddddddd-dddd-4ddd-8ddd-000000000239',  -- Volume Full Set
         'dddddddd-dddd-4ddd-8ddd-000000000240',  -- Volume Refill
         'dddddddd-dddd-4ddd-8ddd-000000000241',  -- Lash Lift + Tint
         'dddddddd-dddd-4ddd-8ddd-000000000242',  -- Individual Lashes
         'dddddddd-dddd-4ddd-8ddd-000000000243',  -- Cluster Lashes
         'dddddddd-dddd-4ddd-8ddd-000000000244',  -- Lash Removal
         'dddddddd-dddd-4ddd-8ddd-000000000245',  -- Eyebrow Wax
         'dddddddd-dddd-4ddd-8ddd-000000000246',  -- Upper Lip Wax
         'dddddddd-dddd-4ddd-8ddd-000000000247',  -- Chin Wax
         'dddddddd-dddd-4ddd-8ddd-000000000248',  -- Full Face Wax
         'dddddddd-dddd-4ddd-8ddd-000000000249',  -- Underarm Wax
         'dddddddd-dddd-4ddd-8ddd-000000000250',  -- Half Arm Wax
         'dddddddd-dddd-4ddd-8ddd-000000000251',  -- Full Arm Wax
         'dddddddd-dddd-4ddd-8ddd-000000000252',  -- Half Leg Wax
         'dddddddd-dddd-4ddd-8ddd-000000000253',  -- Full Leg Wax
         'dddddddd-dddd-4ddd-8ddd-000000000254',  -- Bikini Line
         'dddddddd-dddd-4ddd-8ddd-000000000255',  -- Brazilian
         'dddddddd-dddd-4ddd-8ddd-000000000256',  -- Full Back
         'dddddddd-dddd-4ddd-8ddd-000000000257',  -- Full Body Wax
         'dddddddd-dddd-4ddd-8ddd-000000000258'   -- Full Legs + Underarms + Bikini
       )
on conflict do nothing;

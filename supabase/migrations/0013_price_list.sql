-- ---------------------------------------------------------------------------
-- New price list from the owner's "Price List" flyer, received 2026-10-30.
--
-- Source image: `docs/source-material/smart-price-list-2026-10.png`, sent by
-- the owner via WhatsApp. Transcribed line by line against the image. Names
-- and PRICES below are the flyer's own, including three problems the flyer
-- itself has, listed at the bottom of this header.
--
-- WHAT CHANGED. The flyer is a different shape from the menu in 0010: nine
-- headings (Special Package, Nails, Art & Repair, Gel, Eyelashes Extensions,
-- Manicure, Add On, Massage, Waxing) and 44 lines. It does NOT price facials,
-- makeup, body scrub or the old standalone pedicure range, so all 58 rows from
-- 0006/0010 are DEACTIVATED rather than deleted (a real booking may reference
-- one, the foreign keys are NO ACTION on purpose, and a past appointment must
-- keep resolving at the price it was made at). Owner decision 2026-10-30:
-- hide those ranges until she confirms they are still offered.
--
-- ⚠ DURATIONS ARE STILL ESTIMATES. The flyer states a length only for the
-- three massage lines (60, 30, 30 minutes). `duration_minutes` is `not null`
-- because §6 builds the entire availability grid out of it, and a wrong
-- duration does not fail loudly: it produces appointments that overlap in
-- real life while looking correct in the diary. Every length below is an
-- estimate rounded to the 15-minute grid.
--
-- THAT IS WHY THESE ROWS KEEP THE `dddddddd-` PREFIX even though the names
-- and prices are real. The prefix is what the site looks for, so the sample
-- menu banner keeps showing. Over-warning is the safe direction: the times
-- attached to this menu are still guessed.
-- ---------------------------------------------------------------------------

-- ---------- retire the whole previous menu (0006 + 0010) ----------
update services
   set active = false
 where business_id = '00000000-0000-4000-8000-0000000000b1'
   and active;

-- ---------- the new flyer's services ----------
-- `description` carries the flyer's own heading and nothing else, because the
-- /prices page groups on it and the /treatments/[category] pages match on it.
insert into services (id, business_id, name, description, duration_minutes, turnaround_minutes, price_cents, sort_order) values
  -- SPECIAL PACKAGE
  ('dddddddd-dddd-4ddd-8ddd-000000000301', '00000000-0000-4000-8000-0000000000b1', 'Massage + Facial + Pedicure',        'Special Package', 120, 15,  8000, 301),
  ('dddddddd-dddd-4ddd-8ddd-000000000302', '00000000-0000-4000-8000-0000000000b1', 'Full Mani + Full Pedi + Gelish Eyebrows', 'Special Package', 120, 15,  9000, 302),

  -- NAILS
  ('dddddddd-dddd-4ddd-8ddd-000000000303', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Overlay 3 Gel',       'Nails',  75, 10, 23000, 303),
  ('dddddddd-dddd-4ddd-8ddd-000000000304', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Tips & Gel',          'Nails',  90, 10, 33000, 304),
  ('dddddddd-dddd-4ddd-8ddd-000000000305', '00000000-0000-4000-8000-0000000000b1', 'Acrylic Ombre Tips',          'Nails',  90, 10, 25000, 305),
  ('dddddddd-dddd-4ddd-8ddd-000000000306', '00000000-0000-4000-8000-0000000000b1', 'Acrylic French Tips',         'Nails',  90, 10, 28000, 306),
  ('dddddddd-dddd-4ddd-8ddd-000000000307', '00000000-0000-4000-8000-0000000000b1', 'Sculpture',                   'Nails', 105, 15, 33000, 307),
  ('dddddddd-dddd-4ddd-8ddd-000000000308', '00000000-0000-4000-8000-0000000000b1', 'Back Fill',                   'Nails',  60, 10, 23000, 308),
  ('dddddddd-dddd-4ddd-8ddd-000000000309', '00000000-0000-4000-8000-0000000000b1', 'Normal Nail Hand Polish',     'Nails',  30,  5, 11000, 309),
  ('dddddddd-dddd-4ddd-8ddd-000000000310', '00000000-0000-4000-8000-0000000000b1', 'Normal Feet Nail Polish',     'Nails',  30,  5, 11000, 310),

  -- ART & REPAIR
  ('dddddddd-dddd-4ddd-8ddd-000000000311', '00000000-0000-4000-8000-0000000000b1', 'Nail Art',                    'Art & Repair',  15,  5,  4000, 311),
  ('dddddddd-dddd-4ddd-8ddd-000000000312', '00000000-0000-4000-8000-0000000000b1', 'Nail Repair (One)',           'Art & Repair',  15,  5,  5000, 312),
  ('dddddddd-dddd-4ddd-8ddd-000000000313', '00000000-0000-4000-8000-0000000000b1', 'Some of Gel',                 'Art & Repair',  30,  5,  8000, 313),
  ('dddddddd-dddd-4ddd-8ddd-000000000314', '00000000-0000-4000-8000-0000000000b1', 'Soak Off Acrylic',            'Art & Repair',  30,  5,  8000, 314),

  -- GEL
  ('dddddddd-dddd-4ddd-8ddd-000000000315', '00000000-0000-4000-8000-0000000000b1', 'Gel Overlay Feet',            'Gel',  45, 10, 23000, 315),
  ('dddddddd-dddd-4ddd-8ddd-000000000316', '00000000-0000-4000-8000-0000000000b1', 'Gel Overlay Hand',            'Gel',  45, 10, 23000, 316),
  ('dddddddd-dddd-4ddd-8ddd-000000000317', '00000000-0000-4000-8000-0000000000b1', 'Combo Hand & Feet',           'Gel',  90, 10, 47000, 317),

  -- EYELASHES EXTENSIONS
  ('dddddddd-dddd-4ddd-8ddd-000000000318', '00000000-0000-4000-8000-0000000000b1', 'Classic',                     'Eyelashes Extensions', 105, 15, 38000, 318),
  ('dddddddd-dddd-4ddd-8ddd-000000000319', '00000000-0000-4000-8000-0000000000b1', 'New Set',                     'Eyelashes Extensions', 105, 15, 38000, 319),
  ('dddddddd-dddd-4ddd-8ddd-000000000320', '00000000-0000-4000-8000-0000000000b1', 'One Week Fill',               'Eyelashes Extensions',  45, 10, 13000, 320),
  ('dddddddd-dddd-4ddd-8ddd-000000000321', '00000000-0000-4000-8000-0000000000b1', 'Two Weeks Fill',              'Eyelashes Extensions',  60, 10, 23000, 321),
  ('dddddddd-dddd-4ddd-8ddd-000000000322', '00000000-0000-4000-8000-0000000000b1', 'Three Weeks Fill',            'Eyelashes Extensions',  75, 10, 28000, 322),
  ('dddddddd-dddd-4ddd-8ddd-000000000323', '00000000-0000-4000-8000-0000000000b1', 'Lashes Removal',              'Eyelashes Extensions',  30,  5, 11000, 323),

  -- MANICURE. On the flyer this heading holds the pedicure lines too.
  ('dddddddd-dddd-4ddd-8ddd-000000000324', '00000000-0000-4000-8000-0000000000b1', 'Express Pedi (Normal Paint)', 'Manicure',  45, 10, 23000, 324),
  ('dddddddd-dddd-4ddd-8ddd-000000000325', '00000000-0000-4000-8000-0000000000b1', 'Full Pedi & Gel',             'Manicure',  75, 10, 36000, 325),
  ('dddddddd-dddd-4ddd-8ddd-000000000326', '00000000-0000-4000-8000-0000000000b1', 'Full Pedi & Polish',          'Manicure',  60, 10, 28000, 326),

  -- ADD ON
  ('dddddddd-dddd-4ddd-8ddd-000000000327', '00000000-0000-4000-8000-0000000000b1', 'Paraffin Dip',                'Add On',  15,  5, 11000, 327),
  ('dddddddd-dddd-4ddd-8ddd-000000000328', '00000000-0000-4000-8000-0000000000b1', 'Hot Stone',                   'Add On',  30,  5,  8000, 328),

  -- MASSAGE. The only lines on the flyer that state their own length.
  ('dddddddd-dddd-4ddd-8ddd-000000000329', '00000000-0000-4000-8000-0000000000b1', 'Swedish Massage 60 Minutes',  'Massage', 60, 15, 38000, 329),
  ('dddddddd-dddd-4ddd-8ddd-000000000330', '00000000-0000-4000-8000-0000000000b1', 'Swedish Massage 30 Minutes',  'Massage', 30, 10, 23000, 330),
  ('dddddddd-dddd-4ddd-8ddd-000000000331', '00000000-0000-4000-8000-0000000000b1', 'Feet Massage 30 Minutes',     'Massage', 30, 10, 18000, 331),

  -- WAXING
  ('dddddddd-dddd-4ddd-8ddd-000000000332', '00000000-0000-4000-8000-0000000000b1', 'Eyebrows',                    'Waxing',  15,  5, 11000, 332),
  ('dddddddd-dddd-4ddd-8ddd-000000000333', '00000000-0000-4000-8000-0000000000b1', 'Chin',                        'Waxing',  15,  5, 11000, 333),
  ('dddddddd-dddd-4ddd-8ddd-000000000334', '00000000-0000-4000-8000-0000000000b1', 'Full Face',                   'Waxing',  30,  5, 18000, 334),
  ('dddddddd-dddd-4ddd-8ddd-000000000335', '00000000-0000-4000-8000-0000000000b1', 'Lip Wax',                     'Waxing',  15,  5, 11000, 335),
  ('dddddddd-dddd-4ddd-8ddd-000000000336', '00000000-0000-4000-8000-0000000000b1', 'Nose',                        'Waxing',  15,  5,  8000, 336),
  ('dddddddd-dddd-4ddd-8ddd-000000000337', '00000000-0000-4000-8000-0000000000b1', 'Ears',                        'Waxing',  15,  5,  8000, 337),
  ('dddddddd-dddd-4ddd-8ddd-000000000338', '00000000-0000-4000-8000-0000000000b1', 'Under Arms',                  'Waxing',  15,  5, 15000, 338),
  ('dddddddd-dddd-4ddd-8ddd-000000000339', '00000000-0000-4000-8000-0000000000b1', 'Half Arms',                   'Waxing',  30,  5, 15000, 339),
  -- Flyer prints "HALF ARMS" on this line too (R190). The pattern of the two
  -- lines below it, half legs R150 then full legs R190, makes it certain this
  -- is FULL ARMS. Transcribed as FULL ARMS on purpose; see the flyer warnings.
  ('dddddddd-dddd-4ddd-8ddd-000000000340', '00000000-0000-4000-8000-0000000000b1', 'Full Arms',                   'Waxing',  30,  5, 19000, 340),
  ('dddddddd-dddd-4ddd-8ddd-000000000341', '00000000-0000-4000-8000-0000000000b1', 'Half Legs',                   'Waxing',  30,  5, 15000, 341),
  ('dddddddd-dddd-4ddd-8ddd-000000000342', '00000000-0000-4000-8000-0000000000b1', 'Full Legs',                   'Waxing',  45, 10, 19000, 342),
  ('dddddddd-dddd-4ddd-8ddd-000000000343', '00000000-0000-4000-8000-0000000000b1', 'Bikini Wax',                  'Waxing',  30, 10, 19000, 343),
  ('dddddddd-dddd-4ddd-8ddd-000000000344', '00000000-0000-4000-8000-0000000000b1', 'Hollywood',                   'Waxing',  45, 10, 21000, 344)
on conflict (id) do update set
  name               = excluded.name,
  description        = excluded.description,
  duration_minutes   = excluded.duration_minutes,
  turnaround_minutes = excluded.turnaround_minutes,
  price_cents        = excluded.price_cents,
  sort_order         = excluded.sort_order,
  active             = true;

-- ---------- who performs what ----------
-- Every therapist is mapped to every new treatment, because the flyer says
-- nothing about who does what and a service with NO staff row returns zero
-- slots forever: it would appear on the menu and be permanently unbookable,
-- which is worse than a provisional guess. The therapists themselves are still
-- placeholders until the owner names her team in Admin → Setup.
insert into staff_services (staff_id, service_id)
select st.id, s.id
  from staff st
  cross join services s
 where st.business_id = '00000000-0000-4000-8000-0000000000b1'
   and s.id::text like 'dddddddd-dddd-4ddd-8ddd-0000000003%'
on conflict do nothing;

-- ---------- what needs a chair ----------
-- Feet work needs a pedicure chair. The two special packages land on the
-- treatment room below instead: a package needs more than one resource at
-- once and this table models "can use any one of", so the room is the
-- honest constraint to record (see the note in 0010).
insert into service_resources (service_id, resource_id)
select s.id, r.id
  from services s
  cross join resources r
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000310',  -- Normal Feet Nail Polish
         'dddddddd-dddd-4ddd-8ddd-000000000315',  -- Gel Overlay Feet
         'dddddddd-dddd-4ddd-8ddd-000000000317',  -- Combo Hand & Feet
         'dddddddd-dddd-4ddd-8ddd-000000000324',  -- Express Pedi (Normal Paint)
         'dddddddd-dddd-4ddd-8ddd-000000000325',  -- Full Pedi & Gel
         'dddddddd-dddd-4ddd-8ddd-000000000326',  -- Full Pedi & Polish
         'dddddddd-dddd-4ddd-8ddd-000000000331'   -- Feet Massage 30 Minutes
       )
   and r.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000031',
         'dddddddd-dddd-4ddd-8ddd-000000000032'
       )
on conflict do nothing;

-- ---------- what needs the treatment room ----------
-- Everything a guest lies down for: packages, lashes, massage and waxing.
insert into service_resources (service_id, resource_id)
select s.id, 'dddddddd-dddd-4ddd-8ddd-000000000033'::uuid
  from services s
 where s.id in (
         'dddddddd-dddd-4ddd-8ddd-000000000301',  -- Massage + Facial + Pedicure
         'dddddddd-dddd-4ddd-8ddd-000000000302',  -- Full Mani + Full Pedi + Gelish Eyebrows
         'dddddddd-dddd-4ddd-8ddd-000000000318',  -- Classic lashes
         'dddddddd-dddd-4ddd-8ddd-000000000319',  -- New Set
         'dddddddd-dddd-4ddd-8ddd-000000000320',  -- One Week Fill
         'dddddddd-dddd-4ddd-8ddd-000000000321',  -- Two Weeks Fill
         'dddddddd-dddd-4ddd-8ddd-000000000322',  -- Three Weeks Fill
         'dddddddd-dddd-4ddd-8ddd-000000000323',  -- Lashes Removal
         'dddddddd-dddd-4ddd-8ddd-000000000328',  -- Hot Stone (add on)
         'dddddddd-dddd-4ddd-8ddd-000000000329',  -- Swedish Massage 60
         'dddddddd-dddd-4ddd-8ddd-000000000330',  -- Swedish Massage 30
         'dddddddd-dddd-4ddd-8ddd-000000000331',  -- Feet Massage 30
         'dddddddd-dddd-4ddd-8ddd-000000000332',  -- Eyebrows
         'dddddddd-dddd-4ddd-8ddd-000000000333',  -- Chin
         'dddddddd-dddd-4ddd-8ddd-000000000334',  -- Full Face
         'dddddddd-dddd-4ddd-8ddd-000000000335',  -- Lip Wax
         'dddddddd-dddd-4ddd-8ddd-000000000336',  -- Nose
         'dddddddd-dddd-4ddd-8ddd-000000000337',  -- Ears
         'dddddddd-dddd-4ddd-8ddd-000000000338',  -- Under Arms
         'dddddddd-dddd-4ddd-8ddd-000000000339',  -- Half Arms
         'dddddddd-dddd-4ddd-8ddd-000000000340',  -- Full Arms
         'dddddddd-dddd-4ddd-8ddd-000000000341',  -- Half Legs
         'dddddddd-dddd-4ddd-8ddd-000000000342',  -- Full Legs
         'dddddddd-dddd-4ddd-8ddd-000000000343',  -- Bikini Wax
         'dddddddd-dddd-4ddd-8ddd-000000000344'   -- Hollywood
       )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- THREE PROBLEMS ON THE FLYER ITSELF. Recorded here because the migration is
-- the only place a future reader will look, and because all three are still
-- unresolved with the owner (asked 2026-10-30):
--
--  1. "HALF ARMS" is printed twice, R150 and R190. Transcribed here as
--     Half Arms R150 and Full Arms R190. Near-certain, still unconfirmed.
--
--  2. SPECIAL PACKAGE prices read R80 and R90. A single facial in the menu
--     that was live before this one cost R300 to R550, so a massage, a facial
--     and a pedicure together for R80 is either a genuine loss-leader or a
--     missing zero on the artwork. Owner instructed that it load as printed,
--     so it does, but the homepage promo popup that used to advertise the old
--     R500 package is switched off until she confirms the number.
--
--  3. The flyer no longer prices facials, makeup, body scrub or the standalone
--     pedicure range, yet the Special Package line still includes a facial.
--     Those ranges are deactivated, not deleted, so nothing is lost and they
--     come back with one `update ... set active = true`.
-- ---------------------------------------------------------------------------

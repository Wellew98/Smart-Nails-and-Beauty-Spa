-- ---------------------------------------------------------------------------
-- The business row — Smart Nails and Beauty Spa.
--
-- WHY THIS IS A MIGRATION AND NOT A SEED
-- Supabase's GitHub integration applies `supabase/migrations/*.sql` on merge to
-- the production branch, and nothing else. `supabase/seed.sql` is documented as
-- preview-branch only, so it never reaches the hosted project. Without this
-- file the schema would deploy with no business row at all and every page would
-- render "No business configured".
--
-- For a single-salon product this row is configuration, not sample data, so it
-- belongs in the migration history. It is an idempotent upsert on a fixed id:
-- re-running it corrects the NAP rather than inserting a second business, and
-- it will not clobber the operational settings the owner has since changed.
--
-- NAP MUST MATCH THE GOOGLE BUSINESS PROFILE BYTE FOR BYTE (§8). Same words,
-- same order, same punctuation. Do not tidy it.
--
-- Deliberately does NOT create services, therapists, rooms or hours. Those
-- depend on real business data; the values in seed.sql are spec §10's examples
-- and must never reach production. Add the real ones through Admin > Setup, or
-- in a later migration once they are known.
-- ---------------------------------------------------------------------------

insert into businesses (
  id, name, slug, phone, whatsapp, email, address, google_maps_url,
  timezone, min_notice_minutes, max_advance_days
) values (
  '00000000-0000-4000-8000-0000000000b1',
  'Smart Nails and Beauty Spa',
  'smart-nails-and-beauty-spa',
  '+27810444429',                                  -- displays as 081 044 4429
  '+27810444429',                                  -- confirm if WhatsApp is a separate line
   null,                                            -- no email on the flyer; confirm with owner
  '75 Amanda Avenue, Glenanda, Johannesburg South',
  -- A Maps search on the exact name and address. Replace with the canonical
  -- listing URL, or set gbp_place_id, once available from the profile.
  -- Place id /g/11z6pyc_kz.
  'https://www.google.com/maps/search/?api=1&query=Smart+Nails+and+Beauty+Spa%2C+75+Amanda+Avenue%2C+Glenanda%2C+Johannesburg+South',
  'Africa/Johannesburg',
  120,                                             -- §10: no bookings inside 2h
  60
)
on conflict (id) do update set
  name            = excluded.name,
  slug            = excluded.slug,
  phone           = excluded.phone,
  whatsapp        = excluded.whatsapp,
  email           = excluded.email,
  address         = excluded.address,
  google_maps_url = excluded.google_maps_url,
  timezone        = excluded.timezone;
  -- min_notice_minutes and max_advance_days are intentionally NOT overwritten:
  -- the owner may have tuned them, and a redeploy should not reset her settings.

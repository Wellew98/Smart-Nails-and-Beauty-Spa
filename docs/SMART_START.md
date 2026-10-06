# Smart start — Smart Nails and Beauty Spa

Cloned 6 Oct 2026 from `Wellew98/Grace-Nail-and-Spa-` (commit `8b01397`).
The Grace build is the template; this file is what differs. `docs/HANDOFF.md`
is Grace history — reference only, never apply its NAP/menu/hours here.

## The business (from its own flyer, `docs/source-material/smart-price-menu.webp`)

| | |
|---|---|
| Name | Smart Nails and Beauty Spa |
| Address | 75 Amanda Avenue, Glenanda, Johannesburg South |
| Phone | 081 044 4429 → `+27810444429` |
| Hours | Mon–Sat 08:00–20:00, Sun 09:00–16:00 |
| GBP place id | `/g/11z6pyc_kz` (thin listing: no website, no hours yet) |

## What changed in the clone

- `package.json`, `BUSINESS_SLUG`, layout/error fallbacks → Smart.
- `components/smart-mark.tsx` (real `logo.webp`) replaces drawn `grace-mark.tsx` (deleted).
- `0003_business.sql` → Smart NAP; `0004` hours → 08:00 starts; `0006` rewritten
  as the 54-service flyer transcription (names/prices real, durations estimated,
  `dddddddd-` prefix so the provisional banner stays up).
- `seed-real-hours.sql` → Smart week. Tests asserting NAP/phone/storage-key → Smart.
- Photos: promo art is Smart's own; 4 gallery shots are unbranded placeholders
  (`lib/photos.ts` TODO). Reviews emptied + section hidden (`lib/reviews.ts` TODO).
- Grace review screenshots, branded nail photos and studio interior deleted.

## Still to do (launch order)

1. Create Supabase project → connect GitHub integration → merge to `main`.
2. Create Vercel project from this repo, set env (see README), deploy.
3. Create owner/admin account, sign into `/admin`.
4. Owner confirms: treatment durations, team names, rooms/chairs → Admin → Setup,
   then re-issue menu rows with real uuids to clear the banner.
5. Owner supplies: studio photos, review screenshots, WhatsApp confirmation,
   canonical GBP URL (`gbp_place_id`).
6. Add website + hours to the Smart GBP; link site ↔ listing.

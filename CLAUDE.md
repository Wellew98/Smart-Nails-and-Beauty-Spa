# Smart Nails and Beauty Spa — session context

Second salon website for the owner. Full clone of the Grace Nails booking build,
with its own Supabase project + Vercel deployment. Live and verified 2026-10-06.

## Canonical business facts (single source of truth = `businesses` row)

- Name: Smart Nails and Beauty Spa
- Address: 75 Amanda Avenue, Glenanda, Johannesburg South
- Phone: 081 044 4429 (tel +27810444429) — WhatsApp link uses the same number
- Hours: Mon–Sat 08:00–20:00, Sun 09:00–16:00
- Tagline: "Beauty. Confidence. You."
- Google profile: https://share.google/YCGyl905twfYUsGW3
  (place id `/g/11z6pyc_kz`, coords -26.2663985, 28.0332218)
- Review link (for clients): https://g.page/r/CTOzepJCQc2iEBM/review
- Slug: `smart-nails-and-beauty-spa` · storage key `smart.chat.v1`

Sister salon (reference build, do not mix up): Grace Nails and Beauty Spa,
11 Amanda Ave, Glenanda, 2091, 063 352 5374,
https://share.google/9BPBSR4uTxhEJqkqR,
repo `Wellew98/Grace-Nail-and-Spa-`, live https://grace-nail-and-spa-two.vercel.app/

## Infra

- GitHub: `Wellew98/Smart-Nails-and-Beauty-Spa` (branch main)
- **Canonical site: https://www.smartnailsandbeautyspa.co.za** (the owner's domain,
  connected to the same Vercel project; apex 308s to www).
- `https://smart-nails-and-beauty-spa.vercel.app` is the Vercel alias of the SAME
  project. It cannot be switched off, so `next.config.ts` 308s that host to www and
  every indexable page carries a self-referencing canonical. Never publish the
  vercel.app address: Google indexed it alongside the domain and the salon showed
  up twice in search (fixed 2026-10-30).
- Supabase project "Smart Nails and Beauty Spa", region eu-west-1,
  ref `krmtpntzpcopfxbrgwps`, URL `https://krmtpntzpcopfxbrgwps.supabase.co`
- Business UUID: `00000000-0000-4000-8000-0000000000b1`
- Owner login: https://smart-nails-and-beauty-spa.vercel.app/admin/login
  (`wellefp@gmail.com` — password held by owner, not stored in repo)
- Local checkout: `C:\Users\DELL\Smart-Nails-and-Beauty-Spa`

## Secrets — NOT in this file on purpose

This file is committed to git, so no raw secrets here. Values live in:
1. `C:\Users\DELL\Smart-Nails-and-Beauty-Spa\.env.local` (gitignored) — has
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_DB_URL` (pooler, includes DB password), `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`, `OWNER_NOTIFICATION_EMAIL`.
2. Vercel env (Production + Preview + Development): the 4 Supabase vars above
   plus the 3 mail vars. Gmail app password is named "Smart Nails bookings".

## Decisions / standing rules

- Menu rule: flyer names + prices are real; durations are estimates (only the
  massage lines state a length). Provisional rows carry a `dddddddd-` name
  prefix so the "confirm with owner" banner stays until real durations land.
- CURRENT MENU = `supabase/migrations/0013_price_list.sql` (flyer received
  2026-10-30, image in `docs/source-material/smart-price-list-2026-10.jpeg`).
  9 headings, 44 bookable lines, all `dddddddd-...-3xx` ids. The 58 rows from
  0006 and 0010 are DEACTIVATED, not deleted.
- Hidden until the owner confirms she still offers them: Facials, Makeup,
  Body Scrub, and the standalone pedicure range. Bring any of them back with
  one `update services set active = true where description = '<heading>'`.
  The pedicure lines themselves are live, under the MANICURE heading.
- Three unresolved flyer problems, recorded in the 0013 header and still to be
  asked: (1) "HALF ARMS" printed twice, transcribed as Half Arms R150 + Full
  Arms R190; (2) the Special Package prices read R80 and R90, which is a
  fraction of the sum of their parts; (3) the flyer prices no facials yet the
  Special Package line still includes one.
- The homepage promo popup is OFF (`SHOW_PROMO_POPUP` in `app/page.tsx`) until
  the R80/R90 package prices are confirmed. It is not worth advertising a
  number that may be missing a zero.
- The menu is one fact stored in three places: the DB `description` column,
  `CATEGORY_CONTENT[].key` in `lib/category-content.ts`, and the `match` list in
  `lib/flyer-prices.ts`. A mismatch does not crash, it hides treatments. Guard:
  `npm run test:unit` (`tests/menu-map.unit.test.ts`). When a new flyer lands,
  bump `MENU_MIGRATION` in that test.
- AI chatbot: OFF (no AI key by design). Setup → AI assistant shows disabled state.
- Voucher Phase C (spend voucher during online booking) NOT built — same as Grace;
  only build it once voucher sales exist and someone asks.
- Booking confirmation emails include an "Add to Calendar" .ics link.
- Repeat-customer rule (matches Grace): booking without email reuses the stored
  customer email, so owner mails can reference a different name than typed.
  Only change this if the owner asks.

## Verified working (2026-10-30, live site)

- Menu updated from the owner's 2026-10-30 price list: 44 treatments, 9 headings,
  /prices in flyer order, /book tab strip in display labels. Every new row has a
  staff + room mapping, so all 44 are bookable.
- Retired category URLs redirect: `/treatments/pedicure` → `/treatments/manicure`
  (308), facials / makeup / body-treatments → `/treatments` (307).
- Booking emails: customer + owner mails delivered (Gmail custom "Smart Nails" thread).
- Double-booking: concurrent same-slot → one 201, one 409 `slot_taken`; diary exclusion lock holds.
- Vouchers: issue → emailed → EMAILED TO stamped → redeem walk-in/Today → adjust/void audited.
- Health: `/api/health` and `/api/health?verify=mail` both ok.
- `npm run typecheck`, `npm run build` and `npm run test:unit` pass. `npm run test`
  (the DB-backed suite) needs Postgres on :5433 and has NOT been run since the
  menu change, because Docker is not installed on this machine.

## Test data hygiene

- Test appointments/customers/vouchers must be deleted after live tests
  (diary must read clean for handover). Test customer phone used: +27825550101.
- 2026-10-06 cleanup done: booking test + double-booking test + R50 voucher test
  all removed; live appointment/voucher counts back to 0.

## Owner launch gaps (still open)

1. Confirm durations/team/rooms in Admin → Setup.
2. Supply real studio photos + review screenshots
   (current: `public/smart-logo.webp`, `public/smart-promo.webp` (1021×1021) are real;
   `NAIL_PHOTOS` in `lib/photos.ts` are 4 unbranded placeholders).
3. Confirm WhatsApp line (salon number assumed; GBP chat link uses wa.me/27810444429).
4. Reviews: send https://g.page/r/CTOzepJCQc2iEBM/review (draft message in GBP session notes);
   target 10 in 2 weeks, reply to all.
5. Social URLs (FB/IG/TikTok) → link on GBP. 6. Offer details → first GBP post.
7. Confirm parking/payments/accessibility attributes for GBP.
8. Decide: Fresha listing (commission vs discovery — all top local competitors are on it).
9. CATEGORY RECOMMENDATION (needs owner sign-off, can trigger re-verification):
   flip GBP primary to "Nail salon", keep "Beauty salon" additional — money queries
   are nails queries and 2/3 of the "nail salon near me" pack are Nail-salon-primary.

## GBP state (applied 2026-10-07, manager: wellefp@gmail.com)

- Hours, website, menu link (/treatments), WhatsApp chat, +17 nail services,
  on-site services = Yes, service area already "Johannesburg South" (kept).
- **Appointment link still points at the Vercel alias**
  (`smart-nails-and-beauty-spa.vercel.app`), spotted 2026-10-30 in the Contact
  block of the profile. This is the most visible place the alias still appears:
  it prints in the Search/Maps contact panel no matter how the site is configured,
  and it advertises a hostname that now 308s. Owner (or a neo-connected session)
  must set it to `https://www.smartnailsandbeautyspa.co.za/book` via
  Edit profile → Contact → Appointments. The Website field should also be the
  `www.` form so profile, sitemap, canonicals and JSON-LD all state one exact URL.
  Not fixable from this repo: no GBP API access is configured.
- Description kept (749 chars, keyword-rich). Categories currently Beauty Salon
  primary + Nail salon additional (see flip recommendation above).
- Booking URL → /book set 2026-10-07, pending Google review; re-check "Book online"
  by 2026-10-10, re-submit if absent. No local independent salon has one (first-mover).
- Local 3-pack from Glenanda: "nail salon near me" = Trendy / Precious / Grace;
  "pedicure JHB South" = Beauty Boutique / Precious / Nail Studio and Beauty.
  Smart in neither (0 reviews, 0 photos). Full study: `docs/GBP_STUDY.md`.
- Parked: R6,000 ads credit (needs owner billing), custom email (skip — no ranking benefit),
  address autocomplete (verified N/A — booking takes name/phone/email only).

## Key files

- `components/smart-mark.tsx` — logo (old `grace-mark.tsx` deleted)
- `supabase/migrations/0003_business.sql` — Smart NAP row
- `supabase/migrations/0004_demo_data.sql` — hours (08:00 starts)
- `supabase/migrations/0013_price_list.sql` — current menu (44 lines, 9 headings)
- `supabase/migrations/0006_poster_menu.sql` — first flyer transcription (retired)
- `supabase/migrations/0010_updated_menu.sql` — second flyer (retired)
- `lib/photos.ts` / `lib/reviews.ts` — placeholders + TODOs (`REVIEWS=[]`, homepage conditional)
- `lib/email.ts` / `lib/vouchers.ts` / `app/admin/actions.ts` — mail + voucher logic
- `docs/SMART_START.md` — clone handoff · `docs/HANDOFF.md` — Grace reference only
- `docs/GBP_STUDY.md` — JHB South competitor study, 3-pack captures, corrections log
- `app/contact/page.tsx` — "Getting here" map embed + directions (keyless embed,
  DB-driven address; added 2026-10-07, uncommitted at time of writing)
- `docs/source-material/smart-price-menu.webp` — flyer source
- Source flyer/logo: `C:\Users\DELL\OneDrive\Desktop\Smart Nails and Beauty Spa\`

## Commands

- `npm run typecheck` — must pass before commit (repo convention)
- `npm run dev` — local dev · migrations apply via Supabase MCP (`supabase_execute_sql`)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

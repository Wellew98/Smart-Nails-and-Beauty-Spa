# Smart Nails and Beauty Spa

Booking system for a South African day spa. Next.js (App Router) + Postgres/Supabase +
Tailwind, ZAR, `Africa/Johannesburg`.

Cloned from the Grace Nails and Beauty Spa build (`Wellew98/Grace-Nail-and-Spa-`).
**Phases 1 and 2 only** — Google Calendar sync, WhatsApp reminders and deposits
(Phases 3–5) are deliberately not built.

**Not yet deployed.** Checklist: new Supabase project → apply `supabase/migrations` →
new Vercel project → sign into admin → owner confirms durations and team.

> **Continuing this project in a new session? Read [`docs/SMART_START.md`](docs/SMART_START.md)
> first.** `docs/HANDOFF.md` is the Grace build's history and stays as reference; do not
> apply its Grace-specific values (NAP, menu, hours) here.

---

## Before this goes live

One thing blocks launch. The rest is polish.

### 1. ⚠ Prices are real, durations are estimates, therapists are placeholders

`supabase/migrations/0006_poster_menu.sql` carries the full menu transcribed from the
studio's own printed flyer (`docs/source-material/smart-price-menu.webp`, 54 services) —
names and prices are the business's own. **Durations are estimates** (the flyer states
lengths only for the one-hour massages) and the three therapists (Naledi, Precious, Zanele)
are placeholders, so the provisional-menu banner stays up until the owner confirms.

The owner confirms it all in **Admin → Setup**: treatment lengths, therapist and room names
are editable in place, and therapists can be added. Then re-issue the menu rows with ordinary
uuids so the banner clears (see the header of `0006_poster_menu.sql`).

Spec §10's own example data (Sarah/Nomsa/Lerato, the massage-led menu) is separate again: it
lives in `supabase/seed.sql`, is used only by the acceptance tests, never deploys, and
`db:migrate` refuses `--with-sample-data` against a hosted project.

**Still the launch blocker:** confirmed treatment lengths, the real therapists, and which
rooms or chairs exist.

### 2. NAP is live, taken from the flyer

| | |
|---|---|
| Name | Smart Nails and Beauty Spa |
| Address | 75 Amanda Avenue, Glenanda, Johannesburg South |
| Phone | 081 044 4429 → stored `+27810444429`, displays `081 044 4429` |
| Email | none on the flyer, so stored NULL and omitted from the site |
| Category | Nail salon → JSON-LD `NailSalon` |

These live in **one place only** — the `businesses` row. The footer, the contact page and the
`LocalBusiness` JSON-LD all render from it, so correcting that row corrects everything.

Two follow-ups: the WhatsApp number is assumed to be the same line as the phone (confirm with
the owner), and `google_maps_url` is a Maps search on the exact name and address rather than
the canonical listing URL — replace it from the profile's Share menu, or set `gbp_place_id`
(place id `/g/11z6pyc_kz`).

### 3. Opening hours — from the flyer

Mon–Sat **08:00–20:00**, Sun **09:00–16:00**, printed on the studio's own price flyer.

These hours are attached to the placeholder therapists. When the real ones are added, give them
the same week in **Admin → Setup** — hours hang off each therapist, not off the business.

Public holidays are not modelled in hours; they belong in **Admin → Block**, which is what §3's
`availability_blocks` table is for.

### 4. The admin — sign in after deploy

Not yet verified on this project. After deploy, reach it from the **Staff login** link in the
site footer, or go to `/admin/login` directly, then follow [Creating the owner
account](#creating-the-owner-account) below.

The schema, RLS policies and business row are confirmed live. §9's RLS test was re-run against
the hosted project with only the public key: reading `appointments`, inserting into
`appointments` and reading `customers` all fail with `42501 permission denied`, while the public
catalogue reads fine. Those denials are at the **grant** level, which is a harder stop than RLS
filtering to zero rows.

To add another staff account later, repeat the steps under
[Creating the owner account](#creating-the-owner-account) — the `business_members` insert is the
step that is easy to forget, and without it a user signs in and sees nothing.

### 5. Photography is Smart's own, but thin

The logo (`public/smart-logo.webp`) and hero art (`public/smart-promo.webp`) are Smart's
own files. The four gallery nail shots are unbranded placeholders (see `lib/photos.ts`) and
the reviews section stays hidden until Smart supplies its own screenshots (`lib/reviews.ts`) —
Grace's photos and reviews were removed, not carried over. When real photos exist, they belong
on `/gallery` and on the Google profile.

The swatch colours are **this site's way of telling treatments apart** — they are not a
stock list. An earlier draft of the gallery copy said they were "the shades currently on the
shelf", which was not true, and was rewritten.

### A note on the site copy

`lib/site.ts` holds every word of prose. Only two kinds of claim are allowed in it:

1. Claims about the **booking system**, which are true by construction and checkable against
   the code — appointment lengths exclude turnaround, a room is reserved alongside the
   therapist, every confirmation carries a link to move or cancel.
2. Claims drawn from the business's **own materials** — the printed flyer (Glenanda location,
   opening hours, the 54-service menu) and the logo/promo artwork.

An earlier draft invented a founding story ("started as two chairs and a folding table") and
asserted specific hygiene practice. Both were removed: neither was ours to assert about a real
business. If the owner confirms details like those, add them.

---

## Deploying the site to Vercel

The database already deploys itself (below). This is the web app.

1. **vercel.com → Add New → Project → Import** `Wellew98/Smart-Nails-and-Beauty-Spa`.
2. Framework is detected as Next.js. Leave the build settings alone.
3. Set **Production Branch** to `main` under *Settings → Git*, and make `main`
   the default branch under *GitHub → Settings → General* so fresh clones and
   PRs target the branch that deploys.
4. Add these environment variables (values from the NEW Supabase project, not Grace's):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key |
| `SUPABASE_DB_URL` | Supabase → Connect → **Transaction pooler**, port 6543 |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://smart-nails-and-beauty-spa.vercel.app` |

Use the **pooler** connection string, not the direct one. Each serverless
instance opens its own pool and instances scale out with traffic, so direct
connections exhaust Postgres' limit under exactly the load you wanted to handle.
The pool caps itself at 2 per instance when `VERCEL` is set, and the booking
lock is transaction-scoped so it works through a transaction-mode pooler.

`NEXT_PUBLIC_SITE_URL` matters more than it looks: the manage links in
confirmation emails and the JSON-LD `url` are built from it. Left at localhost,
customers get links to their own machine.

Redeploy after adding variables — Next.js inlines `NEXT_PUBLIC_*` at build time,
so they do not take effect on an existing build.

## Deploying via the Supabase GitHub integration

The project is connected to this repo, so **merging into the production branch applies
`supabase/migrations/*.sql` to the production database.** Three things follow from that, and
the first two are easy to get wrong.

### What deploys, and what does not

| File | Deploys? |
|---|---|
| `supabase/migrations/0001_init.sql` | ✅ schema and both exclusion constraints |
| `supabase/migrations/0002_rls.sql` | ✅ RLS policies |
| `supabase/migrations/0003_business.sql` | ✅ the real business row and NAP |
| `supabase/seed.sql` | ❌ **never** |
| `supabase/seed-real-hours.sql` | ❌ never |
| `supabase/local/0000_local_bootstrap.sql` | ❌ never, correctly — it fakes Supabase's own auth roles |

Supabase's docs are explicit that `seed.sql` is applied to **preview branches only**, and
preview branches need the Pro plan. So the business row had to move into a migration —
otherwise the schema would deploy with no business at all and every page would render
"No business configured".

The example therapists and treatments stay out of `migrations/` on purpose. They are spec
§10's invented data, and deploying them would advertise staff who don't exist at prices
that aren't yours. `npm run db:migrate --with-sample-data` refuses outright when the
connection string points at a hosted project.

### ⚠ Check which branch the Supabase integration is pointed at

`main` now exists, and Vercel serves it. This section used to say the production branch was
`claude/project-doc-8cv2my` and to give instructions for creating `main`; `main` was created
at some point after that and the section was not updated.

**The Supabase integration's "Production branch name" is a setting in the Supabase
dashboard, not in this repository, so it cannot be read from here and has not been
verified.** Go and look at it, because both possible values are a hazard and they fail in
opposite directions:

| If it is set to | Then |
|---|---|
| `claude/project-doc-8cv2my` (the old value) | **Migrations merged into `main` never reach the production database.** Vercel deploys code that expects the new schema against a database that never got it. This one fails quietly and is the more likely of the two. |
| `main` | **Every push to `main` migrates the production database with no review step.** Merge is the gate, so open a pull request rather than pushing straight to `main` whenever a migration is in the diff. |

Set it to `main` and use pull requests for anything touching `supabase/migrations/`. Code-only
changes carry no such risk: a homepage edit with no migration in it cannot alter the database
whichever way this setting is pointed.

### After the first deploy

Migrations create the schema and the business row, but no therapists or treatments — so
`/book` will correctly have nothing to offer until you add them in **Admin → Setup**.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the values

# schema + RLS + the business row, to SUPABASE_DB_URL
npm run db:migrate

# for local work, add §10's example therapists and treatments too
npm run db:migrate -- --with-sample-data

npm run dev
```

`db:migrate` is safe to re-run and applies exactly what the GitHub integration applies, so
running it and merging produce the same database. Against a bare Postgres it also applies the
local stand-in for Supabase's `auth` schema; against a hosted project it skips that, and it
refuses `--with-sample-data` outright. To target a database explicitly:

```bash
npm run db:migrate -- "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
```

### Creating the owner account

The admin has no sign-up screen by design (§7: "single owner account to start"), so the owner
is created by hand, once.

1. **Supabase → Authentication → Users → Add user → Create new user.**
   Enter her email and a password, and tick **Auto Confirm User** — without it she cannot sign
   in until she clicks a confirmation email.
2. **Copy the new user's UID** from the users list.
3. **Supabase → SQL Editor**, and run, with that UID pasted in:

   ```sql
   insert into business_members (user_id, business_id)
   values ('<paste-the-uid-here>', '00000000-0000-4000-8000-0000000000b1')
   on conflict do nothing;
   ```

4. **Sign in** at `/admin/login`. Today should render with the day's diary.

Until step 3 exists she can sign in but sees nothing at all — `getOwnerSession()` finds no
membership row and redirects her back to the login screen. That is the RLS policy working, not
a bug, and it is the single most likely thing to go wrong on first setup.

The SQL editor runs as a privileged role, so the insert is not blocked by the policy that
would stop her writing that row herself.

### Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key (`sb_publishable_…`), gated by RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Older name for the same thing; either works |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. **Never** `NEXT_PUBLIC_`. Not currently read |
| `SUPABASE_DB_URL` | Postgres connection string for the booking engine — see below |
| `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`, `OWNER_NOTIFICATION_EMAIL` | Confirmation email |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL, used in manage links and JSON-LD |

---

## Tests

The §9 acceptance tests run against a **real Postgres**, not mocks — exclusion constraints
and RLS policies only exist in the database, so a fake would assert nothing.

```bash
# any Postgres 16 with btree_gist; defaults to localhost:5433
export TEST_ADMIN_DATABASE_URL=postgresql://postgres@localhost:5433/postgres
npm test
```

68 tests, ~9s. All twelve §9 cases are covered:

| §9 | Case | Where |
|---|---|---|
| 1 | Concurrency — 20 simultaneous, ten runs | `tests/booking.test.ts` |
| 2 | Resource contention | `tests/availability.test.ts` |
| 3 | Turnaround | `tests/availability.test.ts` |
| 4 | Blocks | `tests/availability.test.ts` |
| 5 | Minimum notice | `tests/availability.test.ts` |
| 6 | Idempotency | `tests/booking.test.ts` |
| 7 | Reschedule | `tests/booking.test.ts` |
| 8 | RLS | `tests/rls.test.ts` |
| 9 | Config immutability | `tests/config.test.ts` |
| 10 | Orphan prevention | `tests/config.test.ts` |
| 11 | Hours conflict | `tests/config.test.ts` |
| 12 | Admin double-book | `tests/booking.test.ts` |

Test 1 asserts against the database directly (`findOverlappingPairs`) rather than trusting
the application's own return values.

---

## Decisions worth knowing about

### Server writes use a direct Postgres connection, not supabase-js

Spec §5 says the write path runs "with the Supabase service role key". It uses a direct
connection instead, for three reasons that come from the spec itself:

1. §6 requires reschedule to cancel and re-create **in one transaction**. supabase-js talks
   to PostgREST over HTTP and cannot open one.
2. §5 step 8 requires catching SQLSTATE `23P01` specifically. `pg` exposes it directly;
   PostgREST reshapes the error.
3. §9 test 1 needs a real connection pool to mean anything.

The security property is unchanged: the module is `server-only`, the credential is never
`NEXT_PUBLIC_`, and the browser never writes to `appointments`. Public reads still go
through the anon key path under RLS, and `tests/rls.test.ts` holds the policies to it.
Full reasoning is in `lib/db.ts`.

### Two things the spec required but did not define

- **`appointments.idempotency_key`** — §5 and §9.6 say the key is "stored", but the §3
  schema has nowhere to put it. Added, nullable, unique per business.
- **`business_members`** — §7 requires policies scoped to "their `business_id`", but §3
  defines no mapping from `auth.uid()` to a business. This is the smallest table that
  closes the gap.

### One advisory lock per business on the write path

`appointments` carries two exclusion constraints, so concurrent inserts can each pass one
and then block on the other's uncommitted index entry, in opposite orders — a real
deadlock, even though neither row is invalid. Postgres resolves it, but only after a full
`deadlock_timeout` (1s) per cycle. Under load those compound: twenty racers on one slot
intermittently took **80 seconds** instead of 8.

Appointment writes now take `pg_advisory_xact_lock` on the business first, so every writer
has the same ordering and no cycle can form. The exclusion constraints remain the
authority — this only removes lock-order nondeterminism. Reasoning is in `lib/booking.ts`.

### Seed choices that make §10's claim true

§10 says its configuration "reproduces every edge case in §9 without further setup". Two
mappings are what make that literally true, and both are commented in `seed.sql`:

- Classic Facial is performable by **Sarah only**, so §9.4 (block Sarah, assert no facial
  slots) works as-is.
- Three therapists but **two** massage rooms, so §9.2 (resource contention) works as-is.

§10 assigns rooms to "massage services" and does not place the facial in one, so the facial
requires no resource. If it should occupy a room, add one row to `service_resources` and
nothing else changes.

---

## Bugs found by testing rather than by reading

Recorded because each one would have been invisible in production for a while.

1. **Inactive resources read as "no resource required".** The availability query filters on
   `r.active`, so a service that *requires* a room returned an empty resource set once every
   room was out of service — which §4 says means "needs no resource". Unlimited concurrent
   bookings with `resource_id NULL`, which never conflicts. Now distinguishes "no
   `service_resources` rows" from "set emptied by filtering".
2. **Deadlock storm** under concurrency (above).
3. **Double-tap regression** that the advisory lock exposed: the second of two in-flight
   requests ran its availability check after the first had committed and reported the
   customer's own booking as "slot taken". Idempotency is now checked inside the
   transaction, after the lock and before availability.
4. **Booking flow defaulted to today**, which is usually past the minimum-notice window, so
   the first thing a customer saw was "nothing left". It now advances to the first day with
   real availability.
5. **Walk-in form built its instant in the browser's timezone** — the naive-local-time
   mistake §12 warns about. The form now sends the wall clock and the server converts.
6. **Seed UUIDs were not RFC 4122 conformant** and failed strict validation at the API
   boundary. Made them valid rather than loosening the validator.
7. **`pg` was not declared a server external package**, so the build passed and the runtime
   500s — the driver's optional `pg-native` / `pg-cloudflare` requires break in a serverless
   bundle. This caused a live outage.
8. **`middleware.ts` crashed the deployment** with `MIDDLEWARE_INVOCATION_FAILED`. Next 16
   renamed the convention to `proxy.ts`; the old filename ran through a compatibility path.
   It is now also wrapped so a failed token refresh costs an early logout, never a 500.
9. **A test that never ran.** The health check's secret-key warning appeared to pass while
   asserting against build-time-inlined values — `NEXT_PUBLIC_*` cannot be overridden at
   runtime. That is why `lib/health.ts` is a pure function with unit tests rather than
   something tested through a request.

---

## Layout

```
app/
  page.tsx  services/  about/  gallery/  contact/   Phase 1 site
  book/                                             customer booking flow
  b/[token]/                                        cancel + reschedule, no login
  admin/                                            today, week, walk-in, blocks, setup
  api/availability  api/bookings  api/manage/…      route handlers
  api/health                                        is this deployment wired up?
  global-error.tsx                                  when even the layout cannot render
proxy.ts                                            refreshes the admin session (Next 16)
lib/
  availability.ts     §4 — the slot algorithm
  booking.ts          §5, §6 — write path, cancel, reschedule; the advisory lock
  config-guards.ts    §7.1 — what happens to bookings already on the books
  db.ts               pool, transactions, SQLSTATE handling, connection diagnosis
  health.ts           the checks behind /api/health
  site.ts             every word of prose, and the rule for what may be claimed
  time.ts             timezone conversion at the edges
supabase/
  migrations/         schema, RLS, the business row, the starter menu
  seed.sql            §10's example data — tests and local only, never deployed
  local/              test-only stubs for Supabase's auth roles
scripts/
  apply-migrations.mjs   npm run db:migrate
tests/                the §9 acceptance tests
docs/HANDOFF.md       context for continuing in a new session
```

## Not built, by instruction

Payments, deposits, customer accounts, loyalty, analytics, marketing email, multi-tenant
admin UI. Phases 3–5. Spec §0 and §8.

**The booking assistant is being built** and is no longer a non-goal — v2 §0 has been
amended. It answers questions about treatments, prices, hours and availability, and it
**cannot book, cancel or reschedule anything** — there is no write tool of any kind. It is
an interface to the booking engine and never the authority on a slot: delete `lib/ai` and
the booking system is exactly what it was.

Configured entirely by environment variables (see `.env.example`). With none of them set,
no chat button is rendered, no chat JavaScript is shipped, and every other page is
untouched — verified by loading the site with `GEMINI_API_KEY` removed. `GET /api/health`
reports whether it is configured, and `?verify=ai` asks the provider whether the key still
works. Full notes in [`docs/HANDOFF.md`](docs/HANDOFF.md) §13; the spec is
[`docs/ai-assistant-spec.md`](docs/ai-assistant-spec.md).

**One trap worth knowing:** the chat button's presence is decided when the page is built,
the chat route reads the environment per request. Add the AI variables to an existing
deployment without redeploying and the route will work while the button does not appear.
Set them and redeploy.

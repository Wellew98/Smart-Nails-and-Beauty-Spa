# Handoff — Grace Nails and Beauty Spa

Written at the end of the build session. Everything a new session needs in order to
continue without re-deriving what was already decided, or undoing it by accident.

**Read `README.md` for how to run and deploy. This file is for context: what is done,
what is deliberately the way it is, and what is left.**

---

## 1. Where things stand

Spec: **`docs/spabookingbuildspec2.md`** — v2 supersedes v1, and where they disagree v2
wins. **Phases 1 and 2 are complete.** Phase 3 (Google Calendar sync) is authorised by
v2 §0 but **not started**. Phases 4–5 remain out of scope.

Section numbers moved between v1 and v2. This file cites **v2** throughout; older code
comments still cite v1 (v1 §5 = v2 §7, v1 §4 = v2 §6, v1 §7.1 = v2 §14, v1 §9 = v2 §12).

| | Status |
|---|---|
| Booking engine (v2 §5–§8) | Done. 92 tests green against real Postgres |
| Public site (Phase 1) | Done and deployed |
| `/book`, `/b/[token]` | Done and deployed |
| Admin (v2 §15) | Done, deployed, **signed into and confirmed working** |
| v2 §12.A acceptance tests, all 13 incl. 12a | Passing. Test 8 also re-verified against the live project |
| **Privacy / POPIA (v2 §9)** | **Done — see §11 below.** Clears launch-gate item §1.4 |
| Supabase → GitHub deploy | Working. Migrations apply on push |
| Vercel | Deployed and serving |
| **Vouchers, Phase A (`spa-voucher-build-spec.md`)** | **Done.** Schema, `lib/vouchers.ts`, admin screen, Today/walk-in redemption, cancellation refund, erasure. 16 new tests + RLS + privacy cases, all green |
| Vouchers, Phase B (`/v/[token]`, the email) | **Done, built alongside Phase A** rather than deferred — both were small enough to do together and Phase A alone would have shipped an admin screen with no way for a customer to check her own balance |
| Vouchers, Phase C (redeem at booking time) | **Not started, and not asked for.** Spec §9: wait until vouchers have been sold for a month and customers ask |

### What is live right now

- **Database**: Supabase project `dxweozusaqtymivupswk`, `eu-west-1`. Schema, RLS,
  business row and placeholder menu all applied.
- **Real NAP** (§8, byte-for-byte from the Google Business Profile):
  Grace Nails and Beauty Spa · 11 Amanda Ave, Glenanda, Johannesburg, 2091 · 063 352 5374
- **Hours**: Mon–Sat 09:00–20:00, Sun 09:00–16:00. Confirmed by the owner — the shorter
  Sunday is the real week, not a Women's Day adjustment.
- **Placeholder menu** (see §4 below): 6 treatments, 3 therapists, 3 resources.

---

## 2. THE ONE THING BLOCKING LAUNCH

**The treatments and therapists in production are invented.**

```
Gel Manicure      45min R320      Naledi
Express Manicure  30min R180      Precious
Acrylic Full Set  90min R480      Zanele
Pedicure          60min R350
Gel Pedicure      75min R420
Classic Facial    45min R380
```

None of this came from the business. It exists so the site could be shown before the real
list arrived. **Every page currently displays a banner saying so** — see §4.

To finish: get the real treatment names, lengths and prices, the real therapists, and which
rooms/chairs exist. Enter them in **Admin → Setup**, then run `npm run db:demo-clear`.

**The poster menu is now IN, provisionally** — migration `0006_poster_menu.sql`. The six
invented treatments above are deactivated; the poster's 43 real services and real prices
are active in their place, and all 43 were verified bookable against the real availability
engine (34–43 slots each on a working day).

**It still carries the `dddddddd-` prefix, so the sample banner is still up, and that is
deliberate.** The names and prices are the studio's own; the DURATIONS are estimates,
because the poster gives a length for the three massages and nothing else. Over-warning is
the safe direction — a guessed duration produces appointments that overlap in real life
while looking correct in the diary.

What is still needed before the banner can come down — see
`docs/source-material/README.md`:

- **Confirm every duration.** All estimated except the three massages.
- **Confirm turnaround and the room/chair mapping** (`service_resources`) — currently
  estimated: pedicures get a chair, anything done lying down gets the treatment room.
- **Still no therapist names.** All 43 are mapped to all three invented therapists,
  because a service with no staff row returns zero slots forever and would sit on the
  menu permanently unbookable.
- **The poster's phone number is +27 83-520-4875**, which is not the 063 352 5374 above.
  Do not swap it in. Ask which is current.
- **Confirm the poster itself is current** before entering anything.

---

## 3. Decisions that must not be casually reversed

Each of these looks like it could be simplified. Each one has a failure mode behind it.

### The exclusion constraints are the authority, not the app

`appointments` carries two gist exclusion constraints (`no_staff_overlap`,
`no_resource_overlap`). The application also re-checks availability before inserting.
**Both are required and neither is redundant** — §5 steps 2 and 8. The re-check gives a good
message in the common case; the constraint is what makes it correct when two people tap the
same slot a millisecond apart.

### One advisory lock per business on the write path

`lib/booking.ts` takes `pg_advisory_xact_lock` as the first statement of every booking
transaction. Reason: with two exclusion constraints, concurrent inserts can each pass one and
block on the other's uncommitted index entry in opposite orders — a real deadlock. Postgres
resolves it only after a full `deadlock_timeout` (1s) per cycle, and under load those
compound. Twenty racers on one slot intermittently took **80 seconds** instead of 8.

It is `_xact_` (transaction-scoped) deliberately, so it is safe through a transaction-mode
pooler. A session-scoped lock would break on Supabase's pooler.

### Server writes use `pg`, not `supabase-js`

Spec §5 says "with the Supabase service role key". We use a direct Postgres connection.
Three reasons from the spec itself: §6 needs a real transaction (PostgREST cannot open one),
§5 step 8 needs the raw SQLSTATE, §9.1 needs a real pool. Security property is unchanged —
`server-only`, never `NEXT_PUBLIC_`, browser never writes appointments. Full reasoning in
`lib/db.ts`.

### `pg` must stay in `serverExternalPackages`

`next.config.ts` declares it. Without it the build passes and the **runtime 500s**, because
`pg` reaches for optional `pg-native` / `pg-cloudflare` through conditional requires that
break in a serverless bundle. This cost a live outage.

### `proxy.ts`, not `middleware.ts`

Next 16 renamed the convention. The old filename ran through a compatibility path and
produced `MIDDLEWARE_INVOCATION_FAILED` in production. The file is also wrapped in a
try/catch with a **dynamic** `@supabase/ssr` import, so a failure costs an early logout
rather than a 500 — a static import that fails to initialise throws before any handler code
runs, where a try/catch around the body would never catch it.

### Two schema additions the spec required but did not define

- **`appointments.idempotency_key`** — §5 and §9.6 say the key is "stored", §3 has nowhere
  to put it.
- **`business_members`** — §7 scopes policies to "their `business_id`" but defines no
  mapping from `auth.uid()` to a business.

### The site copy rule

`lib/site.ts` documents it at the top. Only two kinds of claim are allowed: claims about the
**booking system** (true by construction, checkable against the code) and claims from the
business's **own Google Business Profile**. An earlier draft invented a founding story and
asserted hygiene practice; both were removed. Do not reintroduce that class of copy.

---

## 4. The placeholder-data mechanism

- Lives in `supabase/migrations/0004_demo_data.sql`. All rows use the id prefix
  `dddddddd-`.
- `lib/public-data.ts` → `hasDemoData()` detects that prefix.
- **The site-wide banner was removed on the owner's instruction** (11 Aug 2026). It said
  "Sample menu. These treatments, prices and therapists are placeholders…" across the top of
  every page, and it was taken off because nobody is visiting the site yet but the owner and
  the developer, who both already know. `components/demo-banner.tsx` is deleted.
- **What that costs, so it is not discovered by surprise.** The `dddddddd-` rows are still in
  the database and the prices in them are the poster's real prices with ESTIMATED durations
  (see `docs/source-material/README.md`). Nothing on the site now says so. If the URL is given
  to a real customer before those are confirmed, they will book against a length nobody has
  checked. Launch-gate item 1 was already the fix for this; it is now the only one.
- `hasDemoData()` itself stays, and still marks tool results for the assistant, which says so
  in chat and on its service cards. **That is the last remaining warning on any surface.**
- **It is derived from the data, not a flag.** A flag has to be remembered and fails in the
  wrong direction — forget it and invented prices ship with nothing saying so. This way the
  assistant's warning cannot outlive the data or be left switched off.
- Remove with `npm run db:demo-clear`. It deletes when nothing references the rows, and
  **deactivates instead** when a real booking already points at one, so the booking keeps
  resolving at the price it was made at (§7.1). Both paths were exercised.

---

## 5. Seed files — which is which

Three files, easy to confuse:

| File | Purpose | Reaches production? |
|---|---|---|
| `migrations/0003_business.sql` | Real business row and NAP | **Yes** |
| `migrations/0004_demo_data.sql` | Placeholder menu, therapists, rooms | **Yes**, on purpose, with the banner |
| `migrations/0006_poster_menu.sql` | The real poster menu, estimated durations | **Yes**, with the banner — deactivates 0004's treatments |
| `seed.sql` | Spec §10's example data | **No** — tests and local only |
| `seed-real-hours.sql` | Real week over §10's fixture | **No** — local only |
| `local/0000_local_bootstrap.sql` | Fakes Supabase's auth roles | **No** — bare Postgres only |

Supabase's GitHub integration applies **`supabase/migrations/*.sql` only**; `seed.sql` is
documented as preview-branch-only and preview branches need the Pro plan. That is why the
business row had to be a migration.

`seed.sql` keeps §10's fixture hours (Tue–Sat, closing 17:00) because the §9 tests are pinned
to them. The real week has no closed weekday and a later last slot, which would break the
closed-day and end-of-window assertions. **Do not "fix" seed.sql to match reality.**
`tests/helpers/global-setup.ts` deliberately skips `0004`.

---

## 6. Bugs found and fixed — do not reintroduce

Each was found by testing or deploying, not by reading.

1. **Inactive resources read as "no resource required".** The availability query filters on
   `r.active`, so a service that *requires* a room returned an empty resource set once every
   room was inactive — and §4 reads an empty set as "needs no resource". It offered slots
   with `resource_id NULL`, which never conflicts, so one room could be booked without limit.
   `lib/availability.ts` now distinguishes "no `service_resources` rows" from "set emptied by
   filtering".
2. **Deadlock storm** under contention — see §3.
3. **Double-tap regression** that the advisory lock exposed: the second of two in-flight
   requests ran its availability check after the first committed and reported the customer's
   own booking as "slot taken". Idempotency is now checked **inside** the transaction, after
   the lock and before availability.
4. **Booking flow defaulted to today**, usually past the minimum-notice window, so the first
   thing a customer saw was "nothing left". It now advances to the first day with real
   availability.
5. **Walk-in form built its instant in the browser's timezone** — the naive-local-time mistake
   §12 warns about. The form sends wall-clock; the server converts.
6. **Seed UUIDs were not RFC 4122 conformant** and failed strict validation at the API
   boundary.
7. **`pg` not externalised** — production 500s. See §3.
8. **`middleware.ts` crashing the site.** See §3.
9. **A test that never ran.** The health check's secret-key warning appeared to pass while
   asserting against build-time-inlined values. `NEXT_PUBLIC_*` cannot be overridden at
   runtime — that is why `lib/health.ts` is a pure function with unit tests rather than
   something tested through a request.

---

## 7. Diagnosing a broken deployment

**`GET /api/health` first.** It reports which env vars are set, what is wrong with the ones
that are not, and whether the database answers — without exposing any value. It encodes the
mistakes that actually cost time here:

- the direct connection string (IPv6-only, unreachable from Vercel)
- `[YOUR-PASSWORD]` left unreplaced
- `NEXT_PUBLIC_SITE_URL` still localhost
- **a secret key pasted into the public variable** — a security control, not a nit:
  `NEXT_PUBLIC_` ships it to every visitor and it bypasses every RLS policy

`SUPABASE_DB_URL` must be the **transaction pooler** string (`pooler.supabase.com`, port
6543), not `db.<ref>.supabase.co`. A real outage was caused by a missing colon between
username and password — the driver parsed the password as part of the username and sent no
password at all.

### First question when a change is "not working": is it deployed?

Spent a real amount of time on this. `/api/health` said `ok: true` and everything looked
fine — because it was a **healthy deployment of month-old code**. Production was tracking
`claude/project-doc-8cv2my` while the work was being pushed to a different branch, so
nothing shipped and nothing complained.

**Cheapest possible check:** hit `/api/health` and look for a key you know is new. If the
field you just added is not in the response, you are looking at old code, and no amount of
re-reading the configuration will help. Vercel's Deployment Details page states the branch
and commit under **Source** — check that against `git log` before debugging anything else.

### Vercel specifics that cost time

- **The production branch is NOT under Settings → Git.** That page is webhooks, commit
  statuses and LFS. It lives under **Settings → Environments → Production → Branch
  Tracking**. Vercel moved it; older instructions everywhere still say Settings → Git.
- **"Redeploy" rebuilds the SAME COMMIT.** It is a re-run, not a "deploy the latest".
  Redeploying after changing the production branch just rebuilds the old code and looks
  like the change silently failed. To ship newer code: push to the production branch, or
  find that branch's deployment in the list and use **Promote to Production**.
- **Environment variables do not apply to existing deployments.** They are bound at deploy
  time, so a new variable needs a new deployment before any code can read it.
- **Sensitive variables are write-only, and that is fine.** They work at runtime; you just
  cannot read them back, only overwrite. Correct for `GMAIL_APP_PASSWORD` and
  `SUPABASE_DB_URL`. On `NEXT_PUBLIC_*` it does nothing useful — those are inlined into the
  browser bundle and public by definition.

---

## 8. Known environment quirks (this container)

- **Postgres dies when the container recycles.** Restart:
  ```bash
  SP=<scratchpad>/pgdata
  chmod 755 /tmp/claude-0 /tmp/claude-0/-home-user-* <scratchpad>
  su nobody -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D $SP -o '-p 5433 -k /tmp' -l $SP/pg.log start"
  ```
  The `chmod` matters — `nobody` needs to traverse the path.
- **Network egress is allowlisted.** `*.supabase.co`, `*.pooler.supabase.com` and
  `api.supabase.com` were added. `google.com` / `share.google` are blocked, so Google
  Business Profile links cannot be fetched — ask for details as text.
- **Raw Postgres (port 6543) cannot be reached from here at all** — the proxy only tunnels
  HTTPS. Supabase's REST API works, so use that to inspect production data.
- Long-running commands are sometimes killed (exit 144). Re-run; it is not a real failure.

---

## 9. Outstanding

This is v2 §1's launch gate. **Nothing ships to customers until the blocking five are
clear.** Item 4 is done; the other four are not code and cannot be done from here.

**Blocking**

1. **Real treatments, therapists and resources** (§2 above). Enter in Admin → Setup, then
   `npm run db:demo-clear`.
2. **Transactional email configured** — `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`,
   `OWNER_NOTIFICATION_EMAIL`. Built, and silently no-ops without them: the customer books,
   receives nothing, and phones to check.
3. **Production branch off the feature branch.** Half done. `main` exists and **Vercel
   serves it** — verified 14 Aug 2026 by pushing to `main` and watching it reach the live
   URL. Two settings are still outstanding: the **Supabase** integration's production branch,
   which lives in the Supabase dashboard and cannot be checked from the repo, and **GitHub's
   default branch**, which is still `claude/project-doc-8cv2my`. See the deploy section of
   the README for what goes wrong under each. Nothing here blocks a code-only change.
4. ~~**Privacy notice on `/book`**~~ — **done**, see §11.
5. **Booking URL on the Google Business Profile.** For a spa in Glenanda, Maps is where the
   traffic is. Omitted from v1 entirely.

**Before telling anyone about it**

6. `gbp_place_id` set, or `google_maps_url` replaced with the canonical listing URL.
7. Confirm whether WhatsApp is a separate line from `063 352 5374`.
8. Real photography for `/gallery`. **Ten photographs now exist** in `public/photos/` —
   nine nail shots and the only interior shot of the salon. Five of the nine are confirmed
   as the studio's own work (their brand card is in frame); four are not, and one looks
   like a catalogue photo. Provenance and captioning rules are in
   `docs/source-material/README.md`. Nothing references them yet — putting them on a page
   is still to do.
9. **Owner-in-hand test** (v2 §12.B) — she does four tasks on her own phone, unprompted.
10. **One real customer** books end to end, cold (v2 §12.C).
11. **Ask the owner to confirm her hours in her own words.** The banner outside the shop
    says Monday–Sunday 9am–6pm; the Google Business Profile says 9am–8pm with a short
    Sunday, and the profile is what `seed-real-hours.sql` carries and what the site uses.
    **That is settled — the banner is not a source for hours, and neither is it for the
    phone number** (`docs/source-material/README.md`). What is still open is the same
    question `seed-real-hours.sql` already flags in its header: Sunday and Monday were
    read off Google over a public-holiday weekend and may be holiday-adjusted. Whatever
    she says goes into `working_hours` once, through Admin → Setup, and the hero line,
    the footer, the JSON-LD and the diary all follow.
12. **The logo artwork.** `components/grace-mark.tsx` draws the mark from a photograph of
    the shopfront banner — a faithful reconstruction in the site's own faces, not the
    original. Ask her for the file (any vector: `.svg`, `.ai`, `.pdf`) and replace the
    innards of that one component; everything on the site imports the mark from there.

9 and 10 are gates, not nice-to-haves. Everything above them is verifiable by code; those
two are the only evidence the system will actually be used. Nobody has booked a real
appointment on this yet — **it is deployed, not launched.**

**Also outstanding:** rotate the database password (it was pasted into a chat transcript
during debugging). Supabase → Settings → Database → Reset, update `SUPABASE_DB_URL` in
Vercel, **redeploy**, then hit `/api/health`. Rotation without redeploy takes the booking
page offline.

**Next build:** Phase 3, Google Calendar sync — v2 §11. Not started. v2 says to wait until
she has used the admin for a full week and build against what she actually opens.

**Explicitly out of scope** — Phases 4–5, and everything in v2 §0's non-goals: payments,
customer accounts, loyalty, analytics, marketing email, multi-tenant admin UI.

**No longer out of scope: the booking assistant.** v2 §0 used to list "no chatbot" and has
been amended — read that section before touching `lib/ai/`. It is an interface to the
booking engine, not a second one: it reads the same rows the site renders, it calls §6
rather than reimplementing it, a booking still goes through §7 in full, and no personal data
reaches the model. Delete `lib/ai` and the booking system is exactly what it was; that is
the property to preserve. See §13 below for where it has got to.

---

## 10. Orientation

```
lib/availability.ts     v2 §6 — the slot algorithm. 15-min grid, occupancy = duration + turnaround
lib/booking.ts          v2 §7, §8 — write path, cancel, reschedule, erase. The advisory lock lives here
lib/config-guards.ts    v2 §14 — what happens to bookings already on the books
lib/db.ts               pool, transactions, SQLSTATE handling, connection diagnosis. The
                        shared advisory lock (lockBusinessForWrite) lives here so
                        lib/vouchers.ts can take the exact same one
lib/health.ts           the checks behind /api/health
lib/time.ts             timezone conversion at the edges
lib/site.ts             every word of prose, and the rule for what may be claimed
lib/vouchers.ts         spa-voucher-build-spec.md — issue/redeem/refund/adjust/void,
                        rand-credit gift vouchers, no customer login (§0)
components/grace-mark.tsx  the studio's logo, drawn — read its header before editing
app/admin/              today · week · walk-in · blocks · vouchers · settings
app/v/[token]/          the voucher spec's §6.2 — read-only balance page, no login
app/privacy/            v2 §9 — the POPIA notice. Read its header before editing a word of it
tests/                  the v2 §12.A acceptance tests, and the voucher spec's §8 tests,
                        against real Postgres
```

Design: the organising device is a **lacquer swatch** — a nail bar's characteristic object is
its colour range, and there was no photography when it was chosen. The photographs in
`public/photos/` now carry `/gallery`, the homepage's "from the studio" strip and the hero's
background, but they sit around the swatch system rather than replacing it. Each treatment
carries its own colour across the whole site. Palette and reasoning are at the top of
`app/globals.css`.

The **homepage hero is the shopfront banner**: the studio's mark, its own
"SCHEDULE AN APPOINTMENT" in heavy caps, the hours on a rose line and the phone under
"get in touch". The wording is in `lib/site.ts`, the reasoning is in the comment above the
hero in `app/page.tsx`, and where each piece came from is in
`docs/source-material/README.md`. The hours and the phone number are read from the
database, never written into the copy.

**Run the tests before changing anything in `lib/`.** They are the specification made
executable, and several of them exist because the obvious implementation was wrong.

---

## 11. Privacy and POPIA (v2 §9) — what was built and why it is shaped this way

Clears launch-gate item v2 §1.4. Name and phone are personal information under POPIA, and
it applies to a two-person spa exactly as it does to a bank.

### The pieces

| | |
|---|---|
| `app/privacy/page.tsx` | The notice. Names the **business** as responsible party (§9.2) and whoever runs the site as its operator |
| `components/book/booking-flow.tsx` | One line **above** the confirm button, linking to `/privacy` (§9.1) |
| `components/site-footer.tsx` | Footer link — reachable from anywhere, not only the point of collection |
| `lib/booking.ts` → `forgetCustomer` | "Delete my details" (§9.4) |
| `app/api/manage/[token]/forget/route.ts` | Its route. Same credential as cancel: the manage token |
| `tests/privacy.test.ts` | 8 tests |

### The copy rule applies to `/privacy`, harder

Every sentence on that page is a statement about **what the code does**, and each is
checkable against a named file — that is the only reason it could be written without the
owner's sign-off. It describes the system, not her business. The page header lists what to
verify against what. **Do not add a claim there about how she handles data offline** — her
paper diary, her staff, her retention habits. None of that is ours to assert.

### Erasure anonymises, and three things happen together

`appointments.customer_id` is `not null` and the foreign keys are NO ACTION on purpose
(§14), so a real DELETE either fails loudly or tears a hole in the diary. The studio's
record of work done is not the customer's to erase; her name on it is. So:

1. **Future bookings are cancelled.** Erasing the phone number makes an upcoming
   appointment un-keepable — nobody could be told if the therapist were off sick. The owner
   is emailed about each one after commit, which is why they are read *before* the wipe.
2. **Identifying columns are overwritten**, including free-text notes on both the customer
   and her appointments. Notes are where personal detail accumulates; a deletion that
   leaves "phone her sister on 082…" behind has not deleted anything.
3. **Every manage token is rotated**, which kills the links already in her inbox. Without
   this the record stays reachable by anyone holding an old link and "erased" is not true.

The anonymised marker is `phone = 'erased:<customer_id>'`. It goes in `phone` because that
column is `not null` under `unique (business_id, phone)`, so the placeholder must be both
present and unique. A real number is E.164 and starts `+`, so a leading letter cannot
collide. **Consequence:** the same person booking again later comes back through the
`(business_id, phone)` upsert as a *new* customer row, unlinked to the old one. That is the
point, and `tests/privacy.test.ts` pins it.

`forgetCustomer` takes the same `pg_advisory_xact_lock` as the booking path, so a booking
in flight cannot attach a fresh appointment to a row being emptied.

### One thing that is easy to undo by accident

The manage page does **not** call `router.refresh()` after erasing. Erasure rotates the
token, so the page's own URL is dead the instant it returns; a refresh would replace the
confirmation with a 404 and leave the customer unsure whether anything happened. Verified
in a browser: the old link 404s afterwards.

### Also done under §9.5

`lib/email.ts` no longer logs provider error objects whole. A provider's error can carry
the request back with it, and the request contains a customer's name and email address —
which would put personal data in Vercel's log drain, outside anything she can ask us to
erase. `safeError()` keeps the message and status. No route handler logs a request body;
that was audited and was already clean.

### Still not done, and not codeable from here

§9.2's second half: if the system keeps being operated after handover, the
operator/responsible-party relationship should be **one page in writing**. The site now
says that is the relationship. Nothing has been signed.

This is not legal advice. It is the set of things that are obviously right and cost nothing.

---

## 12. Transactional email — why it is not Resend (yet)

Clears launch-gate item v2 §1.2. **This is a deliberate deviation from spec §16**, which
names `RESEND_API_KEY`. Read this before "fixing" it back.

### The problem

Resend will only send from a domain you have verified. **The spa does not own one** — the
Google Business Profile carries no email address either, and the site is on a
`vercel.app` address. §1.2 is blocking, and blocking a launch on a domain purchase is the
wrong trade when a free path exists that works today.

§1.2's actual requirement is "transactional email configured". The provider is an
implementation detail; the spec assumed a domain would exist.

### The shape

`lib/mail.ts` is a transport seam. `lib/email.ts` composes messages and knows nothing about
who sends them.

```
MAIL_TRANSPORT=gmail|resend     optional — inferred from what is set
  gmail    GMAIL_USER, GMAIL_APP_PASSWORD
  resend   RESEND_API_KEY, BOOKING_FROM_EMAIL
  both     OWNER_NOTIFICATION_EMAIL
```

**The day a domain is verified, switching is environment variables only.** Nothing in the
message composition changes. That was the whole point of building it this way rather than
swapping nodemailer in and calling it done.

Inference prefers **gmail** when both are configured, so adding Resend's variables during a
migration cannot silently change the sender address customers see. Set `MAIL_TRANSPORT`
explicitly to make the switch.

### Why Gmail SMTP and not the alternatives

- **Not the Gmail API.** `gmail.send` is a Google-classed *sensitive* scope. In an
  unpublished project the refresh token expires after **seven days**, so email would die
  every week; avoiding that means submitting for Google's verification review. Zapier and
  Make get away with it because they passed that review once, as a large verified app, and
  you grant *their* app access. An app password over SMTP reaches the identical mailbox
  with none of it.
- **Not Brevo/SendGrid/Mailjet single-sender.** They will all verify a lone `@gmail.com`
  address without a domain. It is a trap: mail then leaves *their* servers claiming to be
  *from* gmail.com, failing SPF and DKIM alignment against Gmail's own DMARC record. Same
  work, worse deliverability, and it is the exact pattern the 2024 Google/Yahoo bulk-sender
  rules keep tightening on.
- **Gmail through Gmail aligns perfectly** and is the most deliverable free option.

An App Password needs 2-Step Verification on the account. It is 16 characters — Google
shows it in four groups of four, and `/api/health` rejects anything that is not 16, because
the common mistake is pasting the account password and Gmail's rejection says nothing
useful.

### Two things that were fixed alongside, and matter more than the provider

**Sends moved off the response path.** They used to be `await`ed before the booking
response returned. That was fine against an HTTP API and would not have been against SMTP —
a STARTTLS handshake is seconds, and §3 is "book in under 60 seconds". All four routes now
dispatch through `after()` from `next/server`, which runs the work once the response is
sent and keeps the function alive to finish it. **Verified: a booking returns 201 in 80ms
with a completely unreachable SMTP server.**

**SMTP timeouts are bounded.** nodemailer defaults to two minutes. Combined with `after()`
keeping the function alive, an unreachable host would hold a serverless function open for
the full two minutes to deliver an email that was never going to arrive. Now 10s connect,
10s greeting, 15s socket. Failing fast costs a log line; the booking is already committed
and already answered.

### /api/health knows which transport it is on

It reports only the variables the selected transport actually uses — Resend's variables on
a Gmail deployment would be noise plus one false alarm. With nothing configured it says so
in as many words, and names both ways out.

**`GET /api/health?verify=mail`** goes further and asks Gmail whether the credentials
actually work, over a real SMTP handshake with no message sent. The default checks are
shape-only: they will confirm an App Password is 16 characters while Gmail rejects those
particular 16, and the first symptom would be an email that silently never arrives. A 535
is translated into the three things that actually cause it — account password pasted
instead of an App Password, password belonging to a different account than `GMAIL_USER`, or
2-Step Verification switched off, which revokes App Passwords.

Opt-in rather than default for two reasons: it costs an SMTP round trip on the endpoint you
open when the site is down, and repeated authentication attempts are the sort of thing a
Google account can decide to alert on. Resend has no equivalent check that does not send a
message, so it reports "not verified" rather than implying otherwise.

This is the one endpoint that can break the silence: `lib/email.ts` never throws into the
write path, which is correct, and the cost of that correctness is that a broken mailer is
otherwise completely invisible.

---

## 13. The booking assistant (`lib/ai/`, `components/ai/`, `app/api/ai/chat/`)

Specified in `docs/ai-assistant-spec.md`; built in batches, whose briefs are
`docs/ai-assistant-batch-a.md` and `-batch-b.md`. **Batches A and B are done. Booking
through the assistant is not built** — there is no `create_booking`, `cancel_booking` or
`reschedule_booking` tool, and the assistant cannot write anything at all.

### The shape

```
lib/ai/provider.ts       the AIProvider seam. Nothing outside lib/ai imports gemini.ts or deepseek.ts
lib/ai/gemini.ts         GeminiProvider, over REST. One call, one bounded timeout, no retries
lib/ai/deepseek.ts       DeepSeekProvider, over OpenAI-compatible REST. Same interface, different wire format
                         Its serialisation is covered by tests/ai/deepseek.test.ts — privacy.test.ts
                         uses a stub provider, so it cannot see a leak in a provider's own wire format
lib/ai/tools.ts          the four READ-ONLY tools + three write tools (model cannot reach the writes)
lib/ai/orchestrator.ts   the bounded loop, and validation of tapped buttons
lib/ai/safety.ts         injection refusal, output scrubbing, log sanitisation
lib/ai/rate-limit.ts     Postgres-backed, per-IP and global
lib/ai/system-prompt.ts  rules only — no price, treatment, therapist, hour or address
```

### Things that will look wrong and are not

- **`check_availability` returns two projections.** The model gets `HH:MM` only
  (no therapist name, no sample data — the UI labels and banner show those).
  The browser gets the ISO instant, resolved `staffId`, `staffName`, and the
  sample-data flag. One engine call, two views. The client sends the staff id
  back **only** when the customer actually named that therapist — otherwise
  the resolved id is just whoever sorted first among the free, and pinning it
  would give an indifferent customer a clash where "Anyone" would have booked
  someone else. `resourceId` goes to neither: §7 step 4 re-resolves the room
  under the advisory lock.
- **`get_services` and `get_staff` also split their projections.** The model
  gets names and descriptions only; prices, durations, sample-data flags and
  everything else stay in the client projection. This is structural, not
  advisory: the model physically cannot repeat what it never received.
- **Redaction applies to customer turns only.** A blanket sweep looks safer and deletes the
  studio's own phone number out of `get_business_info` — silently. See the note above
  `toGeminiContents` in `gemini.ts`.
- **The loop is `maxToolCalls` tool executions, then one final call with no tools offered.**
  Provider calls per turn are therefore never more than `maxToolCalls + 1`. There is also a
  whole-turn budget (`AI_TURN_BUDGET_MS`, 25s): bounding each call alone still allows five
  calls at 20s each, and the platform would truncate that — which looks exactly like a
  broken assistant, with no reply and no log line.
- **Rate limiting fails CLOSED.** If the count cannot be read the assistant is refused. The
  failure it exists to prevent is the one where something is already wrong, and if Postgres
  is down the assistant has nothing to answer with anyway.
- **`ai_rate_limit` stores salted hashes, never IP addresses.** An IP is personal
  information under POPIA. The salt falls back to `SUPABASE_DB_URL` so it cannot silently
  degrade to an unsalted hash, which for IPv4 is no protection at all.

### ⚠ The chat button is decided at BUILD time, the chat route at request time

`app/layout.tsx` renders the widget only when `providerConfigProblem()` returns null, and
the layout is prerendered (`revalidate = 300`). So the button's presence is baked into the
build, while `/api/ai/chat` reads the environment per request.

**Consequence:** add `GEMINI_API_KEY` to an existing deployment without redeploying and the
route works while no button appears, until the next revalidation or deploy. This is the
same rule as every other variable here — "environment variables do not apply to existing
deployments" (§7) — but these two disagreeing for a window is confusing enough to be worth
the warning. **Set the AI variables and redeploy**, then check `/api/health`.

It is this way round on purpose: a deployment with no key ships no button and no chat
JavaScript at all, rather than a button that apologises.

### Verified with the key removed

Homepage 200, `/book` 200, no widget in the HTML, `/api/health` reports
`ai: { ok: true, configured: false }` — an AI-less deployment is a healthy deployment and
must not turn the endpoint red. With a key set: widget renders, and the key appears in
neither the HTML nor any client chunk.

### Still to build

Batch C: booking through the assistant. It must call `createBooking` in `lib/booking.ts` —
the advisory lock, the in-transaction idempotency check and the exclusion constraints are
the point, and §21 of the spec asks for a deterministic idempotency key so a double-tap or
a model retry cannot produce two appointments.

### Batch C — booking, management, privacy

The assistant can now write. Three things about how, because each is a
deliberate reading of the brief rather than the obvious implementation:

**The model has no write tool.** `createBookingTool`, `cancelBookingTool` and
`rescheduleBookingTool` live in `lib/ai/tools.ts` and call `lib/booking.ts`
unchanged — but they are absent from `TOOL_NAMES`, so they are never offered to
the provider. A write happens when the customer taps a confirmation: the route
executes it *before* the model is consulted, then hands the result over as a
turn to narrate. "Never book because the customer said something that sounded
like yes" is therefore a property of the wiring, not of the prompt, and the
assistant cannot report a success the transaction did not return because the
sentence it is narrating is built from the transaction's own result.

**Name, phone and the manage token travel in the request envelope, never in
`messages`.** They go straight to `lib/booking.ts`. `tests/ai/privacy.test.ts`
captures everything the provider was actually handed and greps it — that test
is the guard, because nothing else would notice a future change routing a phone
number through the conversation.

**`get_booking` is the one tool that reads a `customers` join**, so it projects
to `BookingView`, a type with nowhere to put a name, phone or token. The client
gets `BookingCard` with the manage link, rendered in the customer's own browser.

**The 409's alternatives are re-projected.** Fresh slots from §5 step 8 come
straight out of the engine and have never been through `check_availability`'s
split. `conflictAlternatives()` puts them through the same rules — ISO instant,
`staffId` only when the customer named that therapist — because otherwise the
recovery path reintroduces the pinning bug exactly where it is hardest to see:
under contention.

**The idempotency key is a lifecycle problem.** Minted in a ref in
`components/ai/booking-summary.tsx`, re-minted when the selection signature
changes. Generated during render it changes per keystroke and a double tap
books twice; held too stably it survives a change of slot and replays the
original booking. Both directions are pinned in `tests/ai/booking-flow.test.ts`.

**Not done: deployment.** This environment has no Vercel access, so the
deploy, the deployed-commit verification and the real-model latency measurement
in the Batch C brief were not performed. `AI_TURN_BUDGET_MS` is still set from
an unmeasured assumption about model latency — measure a real two-tool-call turn
before trusting it.

### Deployed and verified (10 Aug 2026)

**Deployment:** `grace-nail-and-spa-two.vercel.app` — Vercel tracking `main`,
env vars set, `/api/health` green across Supabase, Gmail, and AI. The chatbot
is live and serving real customers.

**AI_TURN_BUDGET_MS:** DeepSeek two-tool-call turn measured ~3-4s cold, ~1.5s
warm. The 25s budget is a ceiling, not a prediction.

### Gemini free tier replaced with DeepSeek

Google's Gemini free tier has a known bug where it intermittently returns a
candidate with `finish_reason: STOP` and no `parts` — an empty response
(github.com/livekit/agents/issues/4066). This wrecked the chatbot: every
message got "I'm having trouble with the assistant right now."

The fix was two-pronged:
1. **Retry on empty response** — `gemini.ts` marks `malformed_response` as
   retryable; the orchestrator's `withRetry()` wrapper retries once before
   falling back. This helps for genuinely intermittent failures.

   **It will not retry two things, and both matter.** Not a `rate_limited`
   failure: the provider has just asked us to slow down, and re-sending
   immediately is the one response guaranteed to make it worse — on a metered
   free tier it spends quota to do so. And not once the turn budget is spent:
   `retryable` says a later attempt could plausibly succeed, not that there is
   time for one. Without that check, a call that timed out having consumed the
   whole budget was retried with `remaining()` already negative, and
   `resolveTimeoutMs` turns any non-positive value into the full 20-second
   default — so a "bounded" turn quietly ran to about 45 seconds. Both are
   pinned by tests in `tests/ai/orchestration.test.ts`.
2. **DeepSeek provider** — `lib/ai/deepseek.ts` is a full `AIProvider`
   implementation over DeepSeek's OpenAI-compatible API. Cheaper, more
   reliable, no free-tier empty-response bug. Auto-detected from
   `DEEPSEEK_API_KEY`; set `AI_PROVIDER=deepseek` to force it.

Gemini still works — the provider seam means both are supported and auto-
detected by which key is present.

**New env vars for DeepSeek:**
```
AI_PROVIDER=deepseek          # or omit — auto-detected from DEEPSEEK_API_KEY
DEEPSEEK_API_KEY=sk-...       # platform.deepseek.com > API keys
AI_MODEL=deepseek-chat
```

**Files changed:** `lib/ai/deepseek.ts` (new), `lib/ai/provider.ts` (added
DeepSeek branch), `lib/ai/types.ts` (extended `ProviderName`, added
`toolCallId` to `AIMessage` and `id` to `AIToolCall`), `.env.example`.

### Structural model/client projection split

The biggest recurring problem was the model repeating information the UI already
shows: listing treatments with prices, naming therapists on every slot,
repeating the "Sample menu" warning. Fixing it in the system prompt was
whack-a-mole — the model would find new ways to regurgitate.

The real fix is structural: **strip the data from the model projection.**
If the model never receives therapist names, prices, durations, or sample-data
flags, it physically cannot repeat them.

The split follows the same pattern `projectBooking()` already uses for
`get_booking` — `view` (model) and `card` (client) from the same row:

| Tool | Model gets | Client gets (unchanged) |
|---|---|---|
| `get_services` | `{id, name, description}` | Full cards: price, duration, sample flag |
| `check_availability` | `{time}` per slot | `{time, staffName, staffId, startsAt}` |
| `get_staff` | `{name, services}` | Everything else stays server-side |

Sample data flags (`sample_data`, `sample_data_notice`) are stripped from all
model projections. The UI banner and cards render them; the model never sees
them and therefore never repeats them.

**Files changed:** `lib/ai/tools.ts` (executeTool dispatch, AvailabilityOutcome
type), `lib/ai/types.ts` (AvailabilitySlot.with optional, AvailabilityInfo
.timezone optional).

### Services card deduplication

The services attachment was returned on every turn where the model called
`get_services`, causing the treatment cards to stack with availability slots.

**Server-side:** When the incoming action is a `service` pick, strip any
`services` attachment from the response — the customer already chose one.

**Client-side:** `withoutIncidentalMenu()` drops the menu when the SAME TURN
also carried availability, a booking or a conflict — i.e. when the model
fetched it in passing and the customer asked for something more specific. Menu
on its own always renders.

**This is deliberately a rule about one turn, not a memory of past turns.** The
first version fingerprinted the menu and suppressed it whenever it matched the
last one seen. The menu does not change between turns, so the fingerprint
always matched and the cards were suppressed for the rest of the conversation:
"show me the treatments again" rendered nothing. And because the model
projection carries no prices or durations and the system prompt tells it not to
list treatments, the assistant could neither show the menu nor say it — both
ways out closed at once. Do not reintroduce cross-turn state here.

**Files changed:** `app/api/ai/chat/route.ts`, `components/ai/chat-window.tsx`.

### System prompt cleanup

Added rules for plain-text formatting (no markdown), but these are insurance —
the structural split is what actually prevents the model from repeating UI data.
`lib/ai/system-prompt.ts`.

## 14. Conversation transcripts, and resuming a chat (11 Aug 2026)

**This reverses a decision, and the reversal is the important part of the
entry.** Until now the assistant stored nothing anywhere: the conversation
lived in React state, and `components/ai/chat-window.tsx` said in its header
that "closing the tab is the retention policy". That was right while nobody had
a use for a transcript. The owner now has one — she wants to see what people
ask, which treatments they ask for that are not on the menu, and where a
conversation stopped short of a booking. None of that is answerable without
keeping the words.

### The shape

```
supabase/migrations/0007_ai_conversations.sql   ai_conversations + ai_messages
lib/ai/transcript.ts                            record, prune, read. 30-day retention
app/admin/chats/page.tsx                        the owner's screen. No JS: <details>
components/ai/chat-session.ts                   sessionStorage resume, browser side
```

The chat route records **after** it has replied, and only the customer's own
last message plus the assistant's reply. Not the synthetic turns it pushes into
`messages` to tell the model what a write did — `[The booking was written to
the database…]` is machinery, not something anybody said.

### What did NOT change, and must not

**Name, phone and the manage token still travel in the envelope, never in
`messages`.** That is what keeps them out of the transcript, and it is
structural rather than a redaction rule: there is no code path that could put
them there. `tests/ai/transcript.test.ts` books through the REAL route with a
real phone number and greps the stored rows for it, alongside the existing
`tests/ai/privacy.test.ts` which greps what the provider was handed.

### ⚠ `after()` throws outside a request scope, and that throw is catchable

The recording is deferred with `after()`. Registering it **inside** the route's
`try` meant that in any context without a Next request scope, `after` itself
threw, the route's own catch swallowed it, and the customer got the fallback
message — after the model had been paid for and a booking possibly written. The
registration is now wrapped, and falls back to running the work inline. Do not
move it back inside the try.

### Erasure reaches it, and that is why `customer_id` exists

A conversation that ends in a booking is linked to that customer, and
`forgetCustomer` deletes it **in the same transaction** as the wipe of the
`customers` row — not in a helper afterwards, which would leave a window where
the person is erased and the conversation naming them is still readable in
Admin. Conversations that never booked have nobody to link to; they age out on
their own within 30 days.

### The retention window is enforced by a 2% sample on the hot path

There is no cron in this project. `pruneOccasionally()` deletes past-window
conversations on roughly one turn in fifty, exactly as the rate limiter prunes
its buckets. **If that call stops happening, the privacy notice quietly becomes
untrue** — `app/privacy/page.tsx` states 30 days, and `AI_TRANSCRIPT_RETENTION_DAYS`
changes it. Changing one means changing the other.

### Resuming: sessionStorage, deliberately not localStorage

The panel unmounts when closed, and a phone browser reloads a backgrounded tab
whenever it likes; either used to lose the conversation. sessionStorage fixes
exactly that and dies with the tab. localStorage would survive more, which is
the reason against it: phones get handed to other people, and a wax appointment
reappearing for the next person to open the site is a worse failure than losing
a conversation.

**The subtle one:** `ChatWindow` slices `turns[0]` off before posting, because
the greeting is ours and not something the customer said. The save cap
therefore trims from the MIDDLE and pins the greeting — trimming from the front
would promote a real message into slot 0 and silently drop it from every
subsequent request. Pinned in `tests/ai/chat-session.test.ts`.

The name and phone typed into the confirmation card are **not** saved.
`pending` is the slot, not the person.

### Fixed alongside: `scripts/apply-migrations.mjs` had drifted

Its `MIGRATIONS` array was hand-written and still ended at `0004`, so
`npm run db:migrate` had been producing databases with no `ai_rate_limit`
(0005) and no real menu (0006) since those landed — failing later, inside the
feature, on a developer's machine only. It now reads the directory, which is
what Supabase's GitHub integration does on merge.

**Files changed:** `supabase/migrations/0007_ai_conversations.sql`,
`lib/ai/transcript.ts`, `lib/ai/orchestrator.ts`, `lib/booking.ts`,
`app/api/ai/chat/route.ts`, `app/admin/chats/page.tsx`,
`components/admin/admin-nav.tsx`, `components/ai/chat-session.ts`,
`components/ai/chat-window.tsx`, `app/privacy/page.tsx`, `.env.example`,
`scripts/apply-migrations.mjs`, `tests/helpers/global-setup.ts`,
`tests/ai/transcript.test.ts`, `tests/ai/chat-session.test.ts`.

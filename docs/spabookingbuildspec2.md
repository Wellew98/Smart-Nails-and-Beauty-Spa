# Spa Booking System — Build Specification v2

**Business:** Grace Nails and Beauty Spa, Glenanda, Johannesburg
**Stack:** Next.js (App Router) + Supabase (Postgres) + Tailwind, on Vercel
**Locale:** South Africa — ZAR, `Africa/Johannesburg` (UTC+2, no DST), WhatsApp-first customers

**Supersedes v1.** v1 was written before anything existed. This version is written after
Phases 1 and 2 shipped, and folds in what the build discovered. Where v1 and v2 disagree,
v2 wins.

---

## 0. Status and how to use this document

**Phases 1 and 2 are complete and deployed.** The review gate v1 §0 asked for has happened.
Phase 3 is now authorised. Phases 4 and 5 are not.

Read in this order:

1. §1 — what is blocking launch. Nothing else matters until these are cleared.
2. §2 — decisions already made that must not be reversed.
3. §11 — Phase 3, the next build.

The rest is reference: unchanged from v1 except where marked **[v2]**.

**Non-goals, unchanged:** no payments, no customer accounts, no loyalty, no analytics
dashboards, no marketing email, no multi-tenant admin UI. Do not add features
not in this document. If something is ambiguous, ask rather than invent.

### [v2, amended] The booking assistant is authorised

"No chatbot" was a non-goal in v1 and in v2 as first written. **It is not one any more.**
The line is struck here rather than quietly ignored: a non-goal left standing next to the
code that contradicts it is how a later session comes to helpfully delete working software,
correctly, by this document's own instruction.

What is authorised is an **interface to the booking engine** — not a replacement for it and
not a second one. The distinction is the whole of the permission:

- It reads the same rows the site renders, through `lib/public-data.ts` and
  `lib/availability.ts`. It holds no catalogue of its own, so an owner's edit in Admin >
  Setup reaches it with no code change and it cannot contradict the page it sits on.
- **It never becomes the authority on a slot.** `check_availability` calls §6; it does not
  reimplement any part of it. A booking still goes through §7 in full — the advisory lock,
  the availability re-check, and the exclusion constraints that are the actual authority
  (§2). Nothing in the assistant may weaken that path.
- It cannot read `customers`, `appointments`, `business_members` or anything in the auth
  tables. No customer's name, phone, email or history enters the model's context.
- It is optional at runtime. Unconfigured, `getProvider()` returns null, the assistant is
  simply absent, and every other path is untouched.

**The test of whether it is still an interface:** delete `lib/ai` and the booking system is
exactly what it was. If that ever stops being true, something has been built in the wrong
place.

Lives in `lib/ai/`, specified separately. Phases 4 and 5 remain out of scope, and the rest
of the non-goals above are unchanged.

---

## 1. [v2] Launch gate — nothing ships to customers until all of these are done

Ordered. Do not reorder.

### Blocking

| # | Item | Why it blocks |
|---|---|---|
| 1 | **Real treatments, therapists, resources.** Enter in Admin → Setup, then `npm run db:demo-clear` | The live site currently advertises invented prices. The banner discloses it, which is honest, but it cannot take a real booking. |
| 2 | **Transactional email configured** — `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`, `OWNER_NOTIFICATION_EMAIL` | It is built and silently no-ops without these. A customer books, receives nothing, and phones to check — worse than having no system. Confirmation is part of the Phase 2 definition of done. |
| 3 | **Production branch moved off the feature branch.** Create `main`; point Supabase and Vercel at it | Right now every push migrates production with no review step. One bad migration takes down a live business's booking page. |
| 4 | **Privacy notice on `/book`** (§9 below) | Name and phone are personal information under POPIA. It applies to a two-person spa the same as to a bank. |
| 5 | **Booking URL attached to the Google Business Profile** (§10 below) | Omitted from v1 — my error. For a spa in Glenanda, Maps is where the traffic is. A booking system nobody can reach from Maps is a website with extra steps. |

### Before telling anyone about it

6. `gbp_place_id` set, or `google_maps_url` replaced with the canonical listing URL.
7. Confirm whether WhatsApp is a separate line from `063 352 5374`.
8. Real photography for `/gallery`.
9. **Owner-in-hand test** (§12.B) — passed, unprompted.
10. **One real customer** books end to end, cold, from their own phone (§12.C).

Item 9 and 10 are gates, not nice-to-haves. Everything above them is verifiable by code.
These two are the only evidence that the system will actually be used.

---

## 2. [v2] Locked decisions — do not reverse

Each of these looks like it could be simplified. Each has a failure mode behind it that
was paid for once already.

**The exclusion constraints are the authority; the app re-check is not redundant.**
`no_staff_overlap` and `no_resource_overlap` on `appointments`, plus the pre-insert
availability re-check. §7 steps 2 and 8. The re-check gives a good message in the common
case; the constraint is what makes it correct when two people tap the same slot a
millisecond apart. Removing either is a correctness regression.

**One `pg_advisory_xact_lock` per business at the head of every booking transaction.**
With two exclusion constraints, concurrent inserts can each pass one and block on the
other's uncommitted index entry in opposite orders — a genuine deadlock. Postgres only
resolves it after a full `deadlock_timeout` per cycle, and under load these compound:
twenty racers on one slot took 80 seconds instead of 8. It must be `_xact_`
(transaction-scoped) so it survives a transaction-mode pooler; a session-scoped lock breaks
on Supabase's pooler.

**Idempotency is checked inside the transaction, after the lock, before availability.**
Checking it outside produced a regression where the second of two in-flight requests ran
its availability check after the first committed and reported the customer's own booking
as "slot taken".

**Server writes use a direct `pg` connection, not `supabase-js`.** §8 needs a real
transaction, which PostgREST cannot open; §7 step 8 needs the raw SQLSTATE; §12 needs a
real pool. The security property is unchanged: `server-only`, never `NEXT_PUBLIC_`, browser
never writes appointments.

**`pg` stays in `serverExternalPackages` in `next.config.ts`.** Without it the build passes
and production 500s, because `pg` reaches for optional `pg-native` / `pg-cloudflare` through
conditional requires that break in a serverless bundle. This caused a live outage.

**`proxy.ts`, not `middleware.ts`.** Next 16 renamed the convention; the old filename runs a
compatibility path that produced `MIDDLEWARE_INVOCATION_FAILED` in production. Keep the
try/catch and the **dynamic** `@supabase/ssr` import — a static import that fails to
initialise throws before any handler code runs, where a try/catch around the body could
never catch it. Failure should cost an early logout, not a 500.

**The demo banner is derived from the data, never a flag.** `hasDemoData()` detects the
`dddddddd-` id prefix. A flag has to be remembered and fails in the wrong direction: forget
it and invented prices ship with nothing saying so. Generalise this instinct — make safety
properties structural so they cannot be left switched off.

**`seed.sql` keeps the §13 fixture hours (Tue–Sat, closing 17:00).** The acceptance tests
are pinned to them, and the real week has no closed weekday and a later last slot, which
would break the closed-day and end-of-window assertions. Do not "fix" it to match reality.
`0004_demo_data.sql` is deliberately skipped by test setup.

**The site copy rule.** Only two kinds of claim are permitted: claims about the **booking
system** (true by construction and checkable against the code) and claims taken from the
business's **own Google Business Profile**. An earlier draft invented a founding story and
asserted hygiene practice. Both were removed. Do not reintroduce that class of copy — for a
real business, invented claims are a liability with her name on them, not yours.

---

## 3. What the system exists to do

1. A customer on a phone books a treatment in under 60 seconds without messaging anyone.
2. The owner sees every booking on the phone she already uses, and never double-books.

Every decision defers to those two. A feature that serves neither is out of scope.

---

## 4. Domain model

A barbershop books **one** resource: a barber. A spa books **two, simultaneously** — a
**therapist** and often a **room or piece of equipment**. A slot is available only if both
are free. Modelling staff alone produces slots that look bookable and physically are not.

**Turnaround.** A 60-minute treatment may occupy the room for 75: 60 of treatment, 15 of
resetting. The customer is shown 60; the calendar blocks 75.

---

## 5. Database schema

Postgres via Supabase. All timestamps `timestamptz`. Never split date and time into separate
columns.

```sql
create extension if not exists btree_gist;

create table businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  phone         text not null,              -- E.164
  whatsapp      text,
  email         text,
  address       text,
  google_maps_url text,
  gbp_place_id  text,
  timezone      text not null default 'Africa/Johannesburg',
  min_notice_minutes int not null default 120,
  max_advance_days   int not null default 60,
  created_at    timestamptz not null default now()
);

create table services (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  name               text not null,
  description        text,
  duration_minutes   int not null check (duration_minutes > 0),
  turnaround_minutes int not null default 0 check (turnaround_minutes >= 0),
  price_cents        int not null check (price_cents >= 0),   -- ZAR cents. Never floats.
  active             boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);

create table staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  google_calendar_id text,              -- Phase 3
  google_refresh_token text,            -- [v2] Phase 3, encrypted at rest
  google_sync_token    text,            -- [v2] Phase 3, incremental sync cursor
  google_channel_id    text,            -- [v2] Phase 3, push notification channel
  google_channel_expiry timestamptz,    -- [v2] Phase 3, re-register before this
  active       boolean not null default true
);

create table resources (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  active       boolean not null default true
);

create table staff_services (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table service_resources (
  service_id  uuid not null references services(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (service_id, resource_id)
);

create table working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),   -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

create table availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid references staff(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  source      text not null default 'admin',   -- [v2] 'admin' | 'google'
  external_id text,                            -- [v2] Google event id, for sync
  check (ends_at > starts_at),
  check (num_nonnulls(staff_id, resource_id) = 1)
);
create unique index on availability_blocks (external_id) where external_id is not null;

create table customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  phone       text not null,          -- E.164. This is the identity key.
  email       text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);

create type appointment_status as enum
  ('pending','confirmed','cancelled','completed','no_show');

create table appointments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  service_id     uuid not null references services(id),
  staff_id       uuid not null references staff(id),
  resource_id    uuid references resources(id),
  customer_id    uuid not null references customers(id),

  starts_at      timestamptz not null,
  ends_at        timestamptz not null,   -- customer-facing end
  blocks_until   timestamptz not null,   -- ends_at + turnaround; calendar occupancy

  status         appointment_status not null default 'confirmed',
  source         text not null default 'web',      -- 'web' | 'admin' | 'walkin'
  manage_token   text not null unique,
  idempotency_key text,                            -- [v2] see §2
  price_cents_at_booking int not null,
  google_event_id text,                            -- [v2] Phase 3
  notes          text,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,

  check (ends_at > starts_at),
  check (blocks_until >= ends_at)
);

create unique index on appointments (business_id, idempotency_key)
  where idempotency_key is not null;

-- THE MOST IMPORTANT LINES IN THIS FILE
alter table appointments add constraint no_staff_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, blocks_until) with &&
  ) where (status in ('pending','confirmed'));

alter table appointments add constraint no_resource_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, blocks_until) with &&
  ) where (status in ('pending','confirmed'));

create index on appointments (business_id, starts_at);
create index on appointments (customer_id);

-- [v2] maps an authenticated user to the business they administer.
-- v1 §7 scoped RLS to "their business_id" without defining this mapping.
create table business_members (
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role        text not null default 'owner',
  primary key (user_id, business_id)
);

create table appointment_events (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  event          text not null,
  actor          text not null,        -- 'customer' | 'admin' | 'system' | 'google'
  detail         jsonb,
  created_at     timestamptz not null default now()
);
```

---

## 6. Availability algorithm

Given `service_id`, `date`, optional `staff_id` ("Anyone" = null):

```
duration   = service.duration_minutes
turnaround = service.turnaround_minutes
occupancy  = duration + turnaround

eligible_staff     = active staff linked via staff_services (filtered if one requested)
required_resources = resources linked via service_resources
eligible_resources = required_resources filtered to active = true

candidate_starts = for each eligible staff member, their working_hours for that
                   weekday, stepped in 15-minute increments, where
                   start + occupancy <= end of the window

for each candidate_start:
  reject if start < now + business.min_notice_minutes
  reject if date  > today + business.max_advance_days
  reject if it overlaps an availability_block for that staff member
  reject if the staff member has an overlapping appointment (pending|confirmed)
  if required_resources is non-empty:
      find the first eligible_resource with no overlapping appointment or block
      reject if none is free
  else:
      resource_id = null

return DISTINCT start times, each carrying its resolved (staff_id, resource_id)
```

### [v2] Correction — the empty-resource-set trap

v1 said "a service with no `service_resources` rows requires no resource; do not treat the
empty set as an error." That sentence caused a live bug. Once every room was deactivated,
the *filtered* set was also empty, the service read as needing no resource, and the system
issued slots with `resource_id NULL` — which never conflicts, so a single room could be
booked without limit.

**The two empty sets are different and must be distinguished:**

- `required_resources` empty → the service genuinely needs no resource. `resource_id = null`
  is correct.
- `required_resources` non-empty but `eligible_resources` empty after the `active` filter →
  **no slots exist at all.** Return nothing. Never fall through to null.

Other invariants:

- **Step by 15 minutes, not by service duration.** Stepping by duration drifts out of
  alignment with existing bookings and hides genuinely free slots.
- **Deduplicate by time, not by staff.** Two free therapists at 10:00 show one 10:00. Keep
  the resolved pair server-side.
- **Availability is advisory; the constraint is authoritative.** The list may be stale by
  the time the customer taps. That is expected — see §7.

---

## 7. Booking write path

Route handler, server-side, direct `pg` pool (§2).

```
POST /api/bookings
body: { service_id, staff_id|null, starts_at, name, phone, email?, idempotency_key }

BEGIN
1.  pg_advisory_xact_lock(business_id)          -- first statement. §2.
2.  Check idempotency_key. If seen, return the existing appointment. COMMIT.
3.  Normalise phone to E.164 (+27...). Reject unparseable.
4.  Re-run §6 for this exact slot. If unavailable → 409 with fresh slots.
5.  Resolve staff_id / resource_id if "Anyone".
6.  ends_at = starts_at + duration; blocks_until = ends_at + turnaround
7.  Upsert customer on (business_id, phone).
8.  Generate manage_token (32 random bytes, url-safe).
9.  INSERT appointment.
10. On SQLSTATE 23P01 (exclusion_violation): do NOT retry blindly.
       → 409 { error: 'slot_taken', slots: <fresh list> }
11. INSERT appointment_events row.
COMMIT
12. Send confirmation email to customer and owner.
13. Return { appointment, manage_url }.
```

Steps 4 and 10 are both required. Step 4 gives a good message in the common case; step 10
is what makes it correct. Implementing only one is the bug this document exists to prevent.

---

## 8. Customer self-service

`/b/[manage_token]`, no login. View, **cancel** (up to `min_notice_minutes` before start),
**reschedule** (same availability and write path; old row cancelled and new one created in
one transaction, preserving `customer_id`).

Not optional. "Can I move my Thursday to Saturday?" is the highest-volume message a spa
receives. If it still lands in WhatsApp, the system has not reduced the owner's workload
and she will stop using it.

---

## 9. [v2] Privacy and POPIA

The system collects name, phone, email and treatment history — the last of which is
arguably health-adjacent. Minimum viable compliance, all of which is cheap:

1. **Notice at the point of collection.** One line above the confirm button on `/book`:
   who holds the data, what it is used for, how to have it removed. Link to a short
   `/privacy` page. No cookie banner needed if you set no non-essential cookies — and do
   not set any.
2. **The business is the responsible party, not you.** Say so on `/privacy`, with her
   contact details. You are an operator processing on her behalf. If you keep operating the
   system after handover, that relationship should be one page in writing.
3. **Purpose limitation.** Data collected for booking is used for booking. Do not build a
   marketing list out of `customers` without separate opt-in — which is out of scope here.
4. **Deletion.** `/b/[token]` should offer "delete my details". Anonymise the `customers`
   row rather than deleting it, so past appointments keep resolving.
5. **No personal data in URLs or logs.** `manage_token` is opaque and carries no name or
   phone. Confirm nothing logs request bodies.
6. **Credential hygiene.** The database password was exposed in a transcript and has been
   rotated. Any future exposure means rotate immediately, not eventually.

This is not legal advice — I am not a lawyer, and if the spa wants certainty they should
get an hour with one. The items above are the ones that are obviously right and cost
nothing.

---

## 10. [v2] Discovery — the part that decides whether any of this matters

A booking system produces zero bookings if customers cannot find it. For a neighbourhood
spa, Google Maps outranks the website as the entry point, usually by a lot.

1. **Attach the booking URL to the Google Business Profile.** Profile → Bookings, or the
   appointment link field. This puts a booking path directly in the Maps listing.
2. **NAP byte-for-byte identical** between the GBP and the site footer, including
   abbreviations and spacing. `Grace Nails and Beauty Spa · 11 Amanda Ave, Glenanda,
   Johannesburg, 2091 · 063 352 5374`. Mismatches dilute the listing.
3. **`LocalBusiness` JSON-LD** on the homepage — already built. Verify it carries the same
   NAP, the real opening hours (Mon–Sat 09:00–20:00, Sun 09:00–16:00), and the booking URL.
4. **Services on the GBP** matching the real menu once §1.1 lands.
5. **Reviews.** The single highest-leverage item, and it is not a code change. After
   Phase 3, a "thank you" email 2 hours post-appointment with a review link is a three-line
   addition. Never incentivise reviews.

---

## 11. [v2] Phase 3 — Google Calendar sync (the next build)

**Why this and not WhatsApp reminders.** She has a phone calendar or a paper book today.
If the admin panel is the only place bookings live, she keeps the old system in parallel,
the two diverge, and the project dies quietly six weeks in. Sync is what decides adoption.
Reminders are what you sell afterwards.

**Wait until she has used the admin for a full week.** Build against what she actually
opens, not what the spec assumes.

### Direction and authority

Two-way, but **not symmetric**. This system remains the source of truth for appointments.
Google is the source of truth only for the therapist's *personal* unavailability.

```
appointments        --push-->   Google Calendar   (this system owns them)
Google events       --pull-->   availability_blocks  (source = 'google')
```

An appointment created here appears on her calendar. An event she creates in Google becomes
a block here. **A Google event never becomes an appointment** — it has no service, no
customer, no resource, and inventing one would corrupt the schema.

### Outbound

- On create: insert a Google event on the therapist's `google_calendar_id`, store
  `google_event_id`.
- On reschedule: patch it.
- On cancel: delete it.
- Event title: customer name + service. Description: phone, and the `manage_url`.
- **Outbound failure must never fail the booking.** Push after `COMMIT`, from a queue with
  retry. A Google outage must not stop the spa taking bookings.

### Inbound

- OAuth per therapist, `calendar.events` scope, refresh token encrypted at rest.
- Watch channels for push notifications; fall back to polling every 10 minutes.
  Re-register before `google_channel_expiry` — channels expire and silent expiry is the
  classic failure.
- Incremental sync via `google_sync_token`. On `410 Gone`, discard and full-resync.
- Each foreign event → an `availability_blocks` row with `source='google'` and
  `external_id` = the event id. Upsert on `external_id`. Deleted event → delete the block.
- **Ignore events this system created.** Filter on `google_event_id` or an extended
  property, or you will build a feedback loop that blocks its own appointments.
- Declined invitations and `transparency: transparent` events do not block.

### Conflict

An inbound event may overlap an existing appointment. **Never auto-cancel.** Write the
block, flag the appointment in admin, and show the owner a conflict banner on Today with
both options. Same principle as §14: surface, let her decide.

### Acceptance tests for Phase 3

13. Create a booking → event appears on the correct calendar with the right times.
14. Cancel it → event is removed.
15. Reschedule → event moves; no duplicate remains.
16. Create an event in Google over a free slot → that slot disappears from `/book`.
17. Delete that event → the slot returns.
18. Assert an appointment pushed to Google does **not** come back as a block (no loop).
19. Simulate `410 Gone` on the sync token → full resync, no duplicated blocks.
20. Simulate Google returning 500 on push → the booking still commits and is retried.

---

## 12. [v2] Acceptance tests

### A. Automated — Phase 2, all must pass

1. **Concurrency.** 20 simultaneous POSTs for one slot: exactly one 201, nineteen 409s,
   zero overlapping rows. Run ten times.
2. **Resource contention.** Two therapists, one room. Book at 10:00 → 10:00 no longer
   offered though a therapist is free.
3. **Turnaround.** 60-min service, 15-min turnaround, booked at 10:00 → 11:00 unavailable,
   11:15 available.
4. **Block.** Block the only eligible therapist 14:00–15:00 → no slots for that service.
5. **Minimum notice.** No slot within `min_notice_minutes` offered or accepted.
6. **Idempotency.** Same key twice → same appointment id, one row.
7. **Reschedule.** Old slot frees, new slot held.
8. **RLS.** With the anon key only, reading and inserting `appointments` both fail.
9. **Config immutability.** Change duration and price after booking → the existing booking
   keeps its stored values; the next booking uses the new ones.
10. **Orphan prevention.** Deactivating staff with upcoming bookings is blocked and returns
    the conflicts.
11. **Hours conflict.** Narrowing hours over an existing booking surfaces it rather than
    orphaning or auto-cancelling it.
12. **Admin double-book.** Owner moving an appointment onto a taken slot is rejected by the
    constraint and the clash is named in the UI.
12a. **[v2] Empty-resource-set.** Deactivate every room for a service that requires one →
    assert zero slots, and assert no slot is ever issued with `resource_id NULL` for a
    service that has `service_resources` rows. This is §6's regression test.

Tests 1, 8 and 12a are the three that matter most. Skipping any means the build is not done.

### B. [v2] Owner-in-hand test — not automatable, and the real gate

The owner, on **her own phone**, with **no prompting from you**, while you say nothing:

- adds a walk-in for someone standing at the counter
- blocks Thursday afternoon because a therapist has a dentist appointment
- finds tomorrow's list
- cancels a booking and knows the customer was told

Any hesitation is a UI defect, not a training gap. Write down where she pauses. The thing
that kills these systems is not bugs — it is the app taking eleven seconds longer than the
paper book on a busy Saturday. You will only see that in her hands.

### C. [v2] Cold-customer test

One person who is not you, who has not seen the site, books a real appointment from their
own phone with no explanation. Watch without helping. Then check: did the confirmation
arrive, did it appear on Today, did the owner notice.

Nobody has booked a real appointment on this yet. Until §12.B and §12.C pass, it is
deployed, not launched.

---

## 13. Seed data

Fixture (tests and local only — see §2): six treatments across manicure, pedicure and
facial; three therapists; three resources; some services requiring a resource and some not.
Fixture hours Tue–Sat 09:00–17:00, Sat to 14:00, closed Sun–Mon. This reproduces every edge
case in §12.A without further setup, and is deliberately **not** the real week.

---

## 14. Editing configuration when bookings already exist

**Existing appointments are immutable snapshots. Config changes affect future bookings only.**
This is why `appointments` stores times and `price_cents_at_booking` literally rather than
deriving them from `services` at read time.

| Owner action | Existing bookings | Required behaviour |
|---|---|---|
| Change **duration** | Unchanged | Save silently |
| Change **price** | Unchanged | Save silently |
| Change **turnaround** | Unchanged | Save silently |
| **Deactivate a service** | Stay valid, still shown in admin | Warn, hide from `/book` |
| **Deactivate staff** | Orphaned — the dangerous one | **Block the save**, list bookings, force reassign or cancel |
| **Deactivate a resource** | Same | Same |
| **Narrow hours** | Fall outside hours | Surface conflicts, owner chooses. Never auto-cancel |
| **Add a block** over bookings | Conflict | Same |
| **Change a service's resources** | Keep assigned resource | Save silently |

**Never hard-delete.** Deactivate via `active = false`. Foreign keys are `NO ACTION` on
purpose — a delete fails loudly rather than orphaning history.

**The owner is not exempt from the double-booking constraint.** She is the most likely
person to trigger one, entering a walk-in while a customer books online. If the constraint
rejects her edit, show her what it clashes with.

Conflict detection, run before every narrowing save:

```sql
select a.* from appointments a
where a.status in ('pending','confirmed')
  and a.starts_at >= now()
  and <newly unavailable window> && tstzrange(a.starts_at, a.blocks_until)
```

---

## 15. Admin

Supabase Auth, email + password, mapped to a business via `business_members`.

- `anon`: SELECT on `businesses`, `services`, `staff`, `resources`, `working_hours` where
  `active = true`. **No access to `appointments` or `customers`.**
- `authenticated`: scoped to their `business_id` **in the policy**, never in application
  code.
- All appointment writes go through route handlers. The service role key and
  `SUPABASE_DB_URL` never appear in browser-bound code and are never `NEXT_PUBLIC_`.

Screens by priority: **Today** (built for a phone in one hand — this is opened twenty times
a day), Week calendar, Add walk-in, Block time, Setup CRUD. One-tap `completed` / `no_show`
from Today.

---

## 16. [v2] Operations

**`GET /api/health` first, always.** It reports which env vars are set, what is wrong with
them, and whether the database answers, without exposing values. It encodes the mistakes
that actually cost time: the IPv6-only direct connection string, `[YOUR-PASSWORD]` left
unreplaced, `NEXT_PUBLIC_SITE_URL` still localhost, and a secret key pasted into a
`NEXT_PUBLIC_` variable — the last of which ships it to every visitor and bypasses every
RLS policy.

- `SUPABASE_DB_URL` must be the **transaction pooler** string (`pooler.supabase.com`,
  port 6543), not `db.<ref>.supabase.co`. A missing colon between username and password once
  caused an outage: the driver parsed the password as part of the username and sent none.
- **After rotating the database password, update `SUPABASE_DB_URL` in Vercel and redeploy**,
  then hit `/api/health`. Rotation without redeploy takes the booking page offline.
- **Branch protection is the deploy gate** (§1.3). Supabase applies
  `supabase/migrations/*.sql` on push to the production branch; `seed.sql` is
  preview-branch-only and preview branches need the Pro plan, which is why the business row
  is a migration.

**Environment**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never NEXT_PUBLIC_
SUPABASE_DB_URL=                  # transaction pooler, port 6543
RESEND_API_KEY=
BOOKING_FROM_EMAIL=
OWNER_NOTIFICATION_EMAIL=
NEXT_PUBLIC_SITE_URL=
GOOGLE_OAUTH_CLIENT_ID=           # Phase 3
GOOGLE_OAUTH_CLIENT_SECRET=       # Phase 3
GOOGLE_WEBHOOK_SECRET=            # Phase 3
```

---

## 17. Conventions

- Money in integer cents. Format for display only. No floats near ZAR.
- Phone numbers to E.164 on write via `libphonenumber-js`, region `ZA`. Store
  `+27821234567`, display `082 123 4567`.
- The server computes all times. The browser sends wall-clock or an ISO instant, never a
  naive local time it constructed itself — that mistake shipped once already in the walk-in
  form.
- `timestamptz` everywhere; convert at the edges only.
- TypeScript, types generated from the schema.
- **Run the tests before changing anything in `lib/`.** They are this specification made
  executable, and several exist because the obvious implementation was wrong.

---

## 18. Out of scope

Phases 4 (WhatsApp reminders — BSP, approved utility templates, per-message cost, sold as a
paid add-on) and 5 (deposits — only if `no_show` data shows they are the real problem;
measure before building). Plus everything in §0's non-goals.

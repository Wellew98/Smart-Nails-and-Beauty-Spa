# Vouchers — build spec

**Status: plan only. Nothing built.** Written for a Claude Code session to execute against
the Grace Nails and Beauty Spa codebase. Read `HANDOFF.md` §3 first — several decisions
below exist because of failure modes already paid for in that file.

Companion to `spa-booking-build-spec-v2.md`. Where they disagree, v2 wins on anything
touching the booking engine; this document owns vouchers only.

---

## 0. The decision that shapes everything: no customer logins

The starting question was "customers need to log in to check their balance". **They do not,
and building that would be a mistake.** Four independent reasons:

1. **The CPA makes vouchers transferable.** A voucher in South Africa can be handed to
   someone else. The holder is frequently not the buyer — that is what a gift voucher *is*.
   An account-linked balance models the wrong thing: it binds value to the purchaser when
   the law binds it to whoever holds the code.
2. **The code already is the credential.** This system has an established pattern for
   credential-free access: `/b/[token]`, the manage link. A voucher code is the same shape
   of thing — a bearer secret in a URL. Adding a second, heavier identity system alongside
   it buys nothing.
3. **Passwords need working email.** Password reset is not optional, and transactional
   email is still launch-gate item §9.2 — unconfigured. An account system would be locked
   behind a blocker that vouchers do not otherwise touch.
4. **v2 §0 lists customer accounts as an explicit non-goal.** This is not a case where
   reality has overtaken the spec; the spec was right.

**What the customer gets instead:** `/v/<code>` — a read-only page showing balance, expiry
and history. No password, no signup, no account to forget. Same trust model as the manage
link, and one she can reach by scanning the QR on her own voucher card.

**Do not add customer authentication as part of this work.** If a future session thinks it
needs it, that is a signal the design has drifted — come back to this section first.

---

## 1. Scope

Decided with the owner:

| | |
|---|---|
| A voucher is worth | **Rand credit**, drawn down over visits. Not a session package |
| Paid for | **In the salon** — cash, card, EFT. The system never touches money |
| Redeemed | **At the counter, by the owner**, against a booking or a walk-in |
| Customer-facing | Read-only balance lookup. Nothing else |

### Explicit non-goals

- **No payment gateway.** She takes payment the way she already does, then records the
  voucher. Adding PayFast/Yoco is a separate project with its own reconciliation and
  refund surface.
- **No voucher redemption during online booking.** The booking engine has no concept of
  payment. Applying credit at booking time means reserving funds against a slot, releasing
  them on cancellation and no-show, and reconciling when a price changes between booking
  and visit. That is a real feature with a real double-spend surface, and it is not what
  she asked for. The ledger below supports it later without a rewrite — see §9.
- **No customer accounts.** §0.
- **No session/package vouchers** ("5 manicures"). If she wants one later, it is a voucher
  with a `service_id` restriction, not a second model. Do not build it speculatively.

---

## 2. Data model

Two tables. One migration, `0006_vouchers.sql`.

```sql
create type voucher_status as enum ('active', 'void');

create table vouchers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,

  -- SHORT, human. Spoken at the counter, written on the card, typed by the owner
  -- in admin. Never appears in a public URL. See §2.1
  code           text not null,          -- as printed: '4K2-P9X'
  code_lookup    text not null,          -- normalised: uppercase, dashes stripped

  -- LONG, secret. Only ever inside the emailed link and the QR on the card.
  -- Same job as appointments.manage_token, and generated the same way.
  lookup_token   text not null unique,

  initial_cents  int  not null check (initial_cents > 0),
  balance_cents  int  not null check (balance_cents >= 0
                                  and balance_cents <= initial_cents),

  status         voucher_status not null default 'active',
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz,            -- null = never expires. See §5

  purchaser_name  text,                  -- optional, POPIA-relevant. See §7
  purchaser_phone text,
  recipient_email text,                  -- optional. Where the code was emailed. §6
  emailed_at      timestamptz,
  note            text,

  unique (business_id, code_lookup)
);

-- Append-only. Nothing in here is ever UPDATEd or DELETEd.
create table voucher_transactions (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid not null references vouchers(id),
  appointment_id uuid references appointments(id),   -- null for counter sales / walk-ins
  kind           text not null check (kind in ('issue','redeem','refund','adjust','void')),
  amount_cents   int  not null,          -- signed: issue +700_00, redeem -320_00
  actor          text not null default 'admin',
  reason         text,
  created_at     timestamptz not null default now()
);

create index on voucher_transactions (voucher_id, created_at);

-- A cancellation must not be able to refund the same voucher twice for the same booking.
create unique index voucher_one_entry_per_kind_per_appointment
  on voucher_transactions (voucher_id, appointment_id, kind)
  where appointment_id is not null;
```

### Why a balance column AND a ledger

`balance_cents` is derivable from the ledger, so storing it is denormalisation. It is there
on purpose, for the same reason `appointments` carries the exclusion constraints rather than
trusting the application (HANDOFF §3):

> Application-level "check then insert" cannot prevent overspending. Two requests one
> millisecond apart both read R700 and both redeem R400.

`check (balance_cents >= 0)` means **Postgres refuses to let a voucher go negative,
regardless of any bug above it.** That guarantee is not available from a derived sum. The
ledger then provides what the column cannot: an audit trail, reversibility, and an answer
to "she says she had R300 left".

**The invariant is `balance_cents = sum(voucher_transactions.amount_cents)`, and it gets a
test** (§8.2). If they ever disagree, the ledger is right and the column is corrupt.

This is the same trade as `price_cents_at_booking` — a stored value with a stated reason,
not an accident.

### 2.1 Two identifiers, and why the code can be short

An earlier draft of this spec used one long code for everything, and said not to shorten it.
**That was correct only because the code was being used for two incompatible jobs.** Split
the jobs and the code gets to be short.

The booking system already solved exactly this: an appointment has an `id` the owner works
with and a long `manage_token` that goes in the customer's link. Vouchers copy it.

| | `code` | `lookup_token` |
|---|---|---|
| Looks like | `4K2-P9X` | 32 random characters |
| Where it appears | Printed on the card, spoken at the counter, typed in admin | Emailed link and QR only |
| Who reads it | A person | A phone |
| Guessing risk | Someone at the counter trying codes on the owner | Anyone, automated, forever |

**`code` — 6 characters, shown as `4K2-P9X`.**

- Alphabet excluding ambiguous characters: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0/O`,
  no `1/I/L`. She will read these over the phone and write them on cards.
- 6 characters from 31 gives ~887 million combinations. A salon this size will issue a few
  hundred vouchers ever, so the odds of a guess landing on a live one are roughly one in
  four million **per attempt, made in person, in front of the owner.** That is not a
  threat. Length was never the real control — being absent from a public URL is.
- `code_lookup` is uppercase with dashes stripped; every lookup goes through it, so
  `4k2p9x`, `4K2-P9X` and `4k2-p9x` all work.
- Generate server-side, retry on unique violation rather than pre-checking. The constraint
  is the authority, as everywhere else here.
- **Do not screen the generated codes for rude words.** It sounds prudent and it is a
  rabbit hole; the excluded-vowel-ish alphabet already makes it unlikely.

**`lookup_token` — long, random, unguessable.** Generated the same way `manage_token` is.
It is the only thing that ever appears in `/v/<...>`, so §6's public page has full entropy
behind it and the short code is never exposed to automated guessing.

**Rotate `lookup_token` when a voucher is voided and reissued.** Same reasoning as rotating
manage tokens on erasure — the old link must stop working.

---

## 3. Operations

All of these live in `lib/vouchers.ts`, server-only, using the existing `pg` pool.

| | |
|---|---|
| `issueVoucher` | Insert voucher + `issue` ledger row, one transaction. Returns the code |
| `redeemVoucher` | Take amount off a voucher, optionally against an appointment |
| `refundRedemption` | Reverse a redemption. Called on cancellation |
| `adjustVoucher` | Owner correction, requires a reason. Both directions |
| `voidVoucher` | Lost or fraudulent. Writes a `void` entry taking balance to 0 |
| `getVoucherByCode` | Lookup + balance + history |
| `outstandingLiability` | Sum of balances on active, unexpired vouchers |

`outstandingLiability` matters more than it looks: it is money the salon owes in services.
Put it on the vouchers admin screen as a single figure.

### Concurrency

**Every write takes `pg_advisory_xact_lock` on the business as its first statement** — the
same lock `lib/booking.ts` uses, deliberately the same lock rather than a per-voucher one.

Reasoning: a per-voucher lock is more granular, but the moment a cancellation needs to touch
both an appointment and a voucher you have two lock namespaces and an ordering problem — and
HANDOFF §3 records what a deadlock storm in this codebase cost. Voucher volume in a
two-therapist salon is a handful a day. **Take the coarse lock; there is no contention to
optimise for.** Revisit only if there is ever evidence of a problem.

The balance is re-read **inside** the locked transaction, never passed in from the UI.

### Redemption rules

- Refuse if `status = 'void'`.
- Refuse if `expires_at < now()`.
- Refuse if `amount > balance` — and **name the shortfall**, so the owner can say "there's
  R380 on it, the rest is R120". Do not silently clamp to the balance; she needs to know.
- Over-redemption is a normal case, not an error: R700 voucher against a R900 treatment
  means redeem R700 and take R200 by other means. The UI shows "remaining to pay".

### Cancellation

When an appointment with a redemption against it is cancelled, **the redemption is refunded,
not deleted.** A `refund` row is appended. The unique index in §2 makes a double-cancel
harmless.

Wire this into `cancelBooking` in `lib/booking.ts`, inside the existing transaction. It
already holds the business advisory lock, so no new locking.

---

## 4. Admin UI

### `/admin/vouchers` — new screen

- **Issue**: amount in rand, optional purchaser name and phone, **optional email address**,
  optional expiry (defaults per §5), optional note. On save, show the code large enough to
  write onto a card, with a print view carrying the code, expiry and QR.
- **List**: code, purchaser, initial, balance, issued, expires, status. Search by code.
  Default to active and unexpired; expired and spent are behind a filter.
- **One figure at the top**: total outstanding liability.
- **Per voucher**: full ledger, and buttons for adjust, void, and **resend email**. Adjust
  and void demand a reason.

The email field is **the recipient's, not necessarily the buyer's.** A gift is bought by one
person for another, and she will want it to land in the right inbox. Label it so that is
obvious — "email the code to" rather than "customer email".

### On the Today screen — the flow that actually gets used

This is the one the owner touches on a busy Saturday, and it is the one to get right.

On an appointment row, a **"Pay with voucher"** action → enter or scan code → the screen
shows purchaser, balance, expiry, and the treatment price → confirm → done, with the
remaining balance stated.

**Keep it to one screen and two taps.** v2 §12.B is explicit that the thing which kills
these systems is the app being slower than the paper book. If this takes longer than
writing "voucher" next to a name, she will write "voucher" next to a name.

Also add it to the walk-in form, where a voucher is at least as likely.

---

## 5. Expiry

**Section 63 of the Consumer Protection Act sets three years from date of issue as the
floor**, and the period cannot be shortened retroactively once a voucher is out. If no
expiry is stated, the voucher must be honoured indefinitely. Vouchers are transferable and
may be used across multiple transactions — both of which this design already assumes.

Therefore:

- `expires_at` defaults to `issued_at + interval '3 years'`. Make the default visible in the
  issue form and let her extend it, not shorten it below three years.
- `expires_at` is **nullable and means "never"** — not a sentinel date.
- **Expiry is derived at read time from `expires_at < now()`. It is never a stored status
  and never a cron job.** This is the same lesson as the demo banner that was just removed
  from this codebase: a status column has to be remembered, and fails in the wrong
  direction. A `WHERE` clause cannot go stale.
- The printed voucher must state the expiry date and that it is transferable. Terms have to
  be communicated at point of sale to be enforceable.

I am not her lawyer and this is not legal advice — it is the shape that keeps her out of
obvious trouble. Worth ten minutes with someone who is, before the first voucher is sold.

---

## 6. Emailing the code, and the customer lookup page

### 6.1 The email

Reuse the existing pipeline. `lib/email.ts` composes, `lib/mail.ts` transports, and the send
is dispatched through `after()` from `next/server` so it never sits on the response path —
all three properties already exist and none of them need changing. Add one message type,
`voucherIssued`, alongside the booking messages.

**Sending must never fail the issue.** The voucher is created and the money is already
taken; an SMTP hiccup cannot roll that back. Same rule the booking path already follows:
commit first, send after, log the failure. `emailed_at` records whether it went, and the
admin gets a **resend** button for when it did not.

Contents:

- The short code, large and unmissable.
- The value, and the expiry date.
- **A link to `/v/<lookup_token>`** — this is what makes the short code safe, because the
  customer never needs to type anything to see her balance.
- A line saying the voucher is transferable and can be used across several visits. That is
  both true and legally required to be communicated.
- The salon's name, address and phone, from `lib/site.ts` like every other message.

Do **not** send an email on every redemption. It is noise, she did not ask for it, and the
balance page already answers the question. If she wants receipts later it is one more
message type on the same seam.

### ⚠ This depends on a launch blocker

**Transactional email is not configured yet** — `GMAIL_USER` and `GMAIL_APP_PASSWORD` are
unset, and that is outstanding item §9.2. Today `lib/email.ts` silently no-ops without them.

So a voucher email will *appear* to work and quietly send nothing. Two consequences for
whoever builds this:

1. The issue screen must show whether the email actually went, based on `emailed_at` — not
   assume it did. "Emailed to thandi@…" or "Not emailed — mail is not configured yet".
2. **The printed card, not the email, is the primary artefact.** The system must be fully
   usable with no email address at all. Email is a convenience layered on top, and building
   it the other way round makes vouchers depend on a blocker they do not otherwise touch.

### 6.2 `/v/[token]`

A server component keyed on `lookup_token`, never on the short code. Shows: balance, initial
value, issue date, expiry, and a plain list of `date · amount · treatment`. Nothing else —
no purchaser phone, no other customer's data.

- **RLS: `anon` gets no access to `vouchers` or `voucher_transactions` at all.** Unlike
  `services` and `staff`, these are not public reference data — a voucher row is money, and
  a readable table is a readable list of live codes. The page reads through the server-side
  pool like the admin does. Add this to `tests/rls.test.ts`; same class as acceptance test 8.
- **Rate limit anyway.** Migration `0005_ai_rate_limit.sql` established the pattern — reuse
  it, keyed on IP. The token has full entropy so this is defence in depth rather than the
  primary control, but it costs nothing. Suggested: 20 attempts per IP per hour.
- A bad token returns the same generic "not found" as a malformed one. No hints about
  whether a token exists but is expired until after the rate limit has been applied.
- **The short code must not work on this route.** If someone builds a `/v/4K2-P9X` fallback
  "for convenience", every argument in §2.1 collapses and the 6-character code becomes
  brute-forceable. This is the single most important line in this section.
- The QR on the printed card encodes this URL, so a customer holding only the card — no
  email — can still check her balance.

---

## 7. POPIA

`purchaser_name`, `purchaser_phone` and `recipient_email` are personal information, and they
are a **new place personal data lives** — the erasure path in HANDOFF §11 currently knows
only about `customers` and `appointments`.

`recipient_email` deserves specific care: it is frequently a *third party's* address, given
by the buyer, for someone who never dealt with the salon directly. Keep it only as long as it
is useful.

- All three fields stay **optional**. A voucher works fine with none of them; do not make
  them required for the convenience of the list view.
- `forgetCustomer` must null all three on any voucher matching the erased customer's phone
  or email, **while leaving the voucher and its ledger intact.** The financial record is the
  salon's; the name on it is the customer's. Same principle already applied to appointments.
- Erasure must also **rotate `lookup_token`**, exactly as it rotates manage tokens. An old
  emailed link that still opens a balance page after erasure means "erased" is not true.
- Update `/privacy` to say vouchers exist and what is kept. Read that page's header before
  editing a word of it — every sentence there is a checkable claim about the code, and this
  adds one.
- Add a case to `tests/privacy.test.ts`.

---

## 8. Acceptance tests

Money. These are not optional, and they follow v2 §12.A's style — real Postgres, no mocks.

1. **Concurrency.** 10 simultaneous R100 redemptions against a R700 voucher → exactly 7
   succeed, 3 fail, final balance 0, and the balance is never negative at any point. Run it
   ten times. **This is the test that matters most** — it is the voucher equivalent of
   acceptance test 1.
2. **Ledger invariant.** After an arbitrary sequence of issue/redeem/refund/adjust,
   `balance_cents = sum(amount_cents)` for every voucher.
3. **Expiry.** A voucher one second past `expires_at` cannot be redeemed. One second before,
   it can. A null `expires_at` never expires.
4. **Void.** A voided voucher cannot be redeemed, and voiding writes a ledger row rather
   than mutating history.
5. **Over-redemption.** R900 against a R700 balance is refused, and the shortfall is named
   in the message.
6. **Cancellation refund.** Cancelling an appointment restores the exact redeemed amount.
   Cancelling twice restores it once.
7. **Cross-tenant.** A code belonging to another business returns not-found, not the
   voucher. Same class as the rename tenancy test in `tests/naming.test.ts`.
8. **RLS.** With the anon key only, selecting from `vouchers` and `voucher_transactions`
   both fail.
9. **Code normalisation.** `4k2p9x`, `4K2-P9X` and `4k2-p9x` all find the same voucher.
10. **The short code is not a public route.** Requesting `/v/<short code>` returns not-found
    — only `lookup_token` resolves. This is §2.1's whole argument, so it gets a test that
    fails loudly if someone adds a convenience fallback later.
11. **Issue survives a dead mailer.** With an unreachable SMTP host, issuing a voucher still
    commits, returns the code, and leaves `emailed_at` null. Mirrors the booking-path
    assertion in HANDOFF §12.

Tests 1, 2, 8 and 10 are the four that decide whether this is done.

---

## 9. Phasing

**Phase A — the whole of the above.** Schema, `lib/vouchers.ts`, admin screen, Today-screen
redemption, cancellation refund, tests. This is shippable and is everything she asked for.

**Phase B — customer lookup and email.** `/v/[token]`, rate limit, the `voucherIssued`
message, QR on the printed card. Separable
because the salon can operate without it; the owner can read a balance off her own screen.

**Phase C — only if she asks, and only with evidence.** Voucher applied during online
booking. The ledger supports it: a reservation is a `redeem` written at booking time and
refunded on cancellation. But it introduces "the customer has paid for a slot", which the
booking engine has no concept of today, and it should not be built on a guess. Wait until
she has sold vouchers for a month and says customers are asking.

Estimate: Phase A is one focused session. Two tables, one library file, one admin screen,
one action on Today, nine tests. **No new dependencies.**

---

## 10. Things not to do

Each of these looks like a simplification and is not.

- **Do not store balance without the ledger.** You lose the audit trail and every dispute
  becomes her word against a number.
- **Do not store the ledger without the balance column.** You lose the `>= 0` constraint,
  and application-level checks do not survive concurrency — HANDOFF §3.
- **Do not UPDATE or DELETE a `voucher_transactions` row.** Corrections are new rows.
- **Do not add a `voucher.expired` boolean.** Derive it. This codebase has already removed
  one derived-vs-stored mistake this month.
- **Do not link a voucher to a `customer_id` as its owner.** Vouchers are transferable by
  law; the purchaser is a record, not a permission.
- **Do not add customer accounts.** §0.
- **Do not use floats for money anywhere.** Integer cents, matching `price_cents`.
- **Do not make the short code work at `/v/`.** §2.1 and §6.2. It is the one change that
  quietly turns a safe design into a brute-forceable one, and it will look like a kindness
  to whoever suggests it.
- **Do not block issuing a voucher on the email sending.** The money is already taken.

-- ---------------------------------------------------------------------------
-- Vouchers — spa-voucher-build-spec.md.
--
-- Two tables. `vouchers` carries a live balance; `voucher_transactions` is the
-- append-only ledger that balance is derived from. Spec §2 explains why both
-- exist rather than just one: the balance column gets Postgres's
-- `check (balance_cents >= 0)` as a hard backstop against overspending under
-- concurrency — something no derived SUM() can give you — and the ledger gives
-- an audit trail and an answer to "she says she had R300 left" that a bare
-- column cannot. The invariant is `balance_cents = sum(voucher_transactions
-- .amount_cents)`, and it has a test (tests/vouchers.test.ts).
--
-- Two identifiers, not one — spec §2.1. `code` is short (6 characters, an
-- excluded-ambiguous-character alphabet), spoken at the counter and typed in
-- admin. `lookup_token` is long and random, the same shape as
-- appointments.manage_token, and is the ONLY thing that may ever appear in a
-- public URL (§6.2's /v/[token]). Splitting the two jobs is what lets the
-- code stay short without becoming guessable — see the spec for the full
-- reasoning. Do not add a route that accepts the short code.
-- ---------------------------------------------------------------------------

create type voucher_status as enum ('active', 'void');

create table vouchers (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,

  code           text not null,          -- as printed: '4K2-P9X'
  code_lookup    text not null,          -- normalised: uppercase, dashes stripped
  lookup_token   text not null unique,   -- long random secret. /v/[token] only.

  initial_cents  int  not null check (initial_cents > 0),
  balance_cents  int  not null check (balance_cents >= 0
                                  and balance_cents <= initial_cents),

  status         voucher_status not null default 'active',
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz,            -- null = never expires. Spec §5.

  purchaser_name  text,                  -- optional, POPIA-relevant. Spec §7.
  purchaser_phone text,
  recipient_email text,                  -- optional. Where the code was emailed.
  emailed_at      timestamptz,
  note            text,

  unique (business_id, code_lookup)
);

create index on vouchers (business_id, status);

-- Append-only. Nothing in here is ever UPDATEd or DELETEd — corrections are
-- new rows (kind = 'adjust' or 'void'), same discipline as appointment_events.
create table voucher_transactions (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid not null references vouchers(id),
  appointment_id uuid references appointments(id),   -- null for counter sales / walk-ins
  kind           text not null check (kind in ('issue','redeem','refund','adjust','void')),
  amount_cents   int  not null,          -- signed: issue +70000, redeem -32000
  actor          text not null default 'admin',
  reason         text,
  created_at     timestamptz not null default now()
);

create index on voucher_transactions (voucher_id, created_at);

-- A cancellation must not be able to refund the same voucher twice for the
-- same booking — spec §3. This is what makes a double-cancel harmless.
create unique index voucher_one_entry_per_kind_per_appointment
  on voucher_transactions (voucher_id, appointment_id, kind)
  where appointment_id is not null;

-- ---------------------------------------------------------------------------
-- Privileges and RLS.
--
-- Spec §6.2 requires the anon key to have NO access at all — "a voucher row is
-- money, and a readable table is a readable list of live codes". It does not
-- ask for owner (`authenticated`) access either, and there is no reason to add
-- it: every voucher write and read in this codebase goes through the
-- server-side `pg` pool (lib/vouchers.ts), exactly like appointments and
-- customers already do in practice, and exactly like `ai_rate_limit` (0005)
-- and `ai_conversations` (0007) — the two other tables added since the
-- original booking spec, both of which revoke `authenticated` too rather than
-- carrying an `owner_rw_*` policy nothing ever exercises. Vouchers follow that
-- more recent precedent: RLS on with no policies, both grants revoked, is a
-- second, independent lock in front of a table that should be reachable by
-- nobody but the server. tests/rls.test.ts holds the anon half to it, the
-- same class as the original acceptance test 8.
-- ---------------------------------------------------------------------------

alter table vouchers             enable row level security;
alter table voucher_transactions enable row level security;

revoke all on vouchers             from anon, authenticated;
revoke all on voucher_transactions from anon, authenticated;

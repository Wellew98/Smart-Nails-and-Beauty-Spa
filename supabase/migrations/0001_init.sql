-- ---------------------------------------------------------------------------
-- Grace Nails and Beauty Spa — core schema
-- Spec §3. All timestamps are timestamptz. Date and time are never stored
-- in separate columns.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist;

-- ---------- tenancy ----------
create table businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  phone         text not null,              -- E.164, e.g. +27821234567
  whatsapp      text,
  email         text,
  address       text,
  google_maps_url text,
  gbp_place_id  text,
  timezone      text not null default 'Africa/Johannesburg',
  min_notice_minutes   int not null default 120,   -- no bookings inside 2h
  max_advance_days     int not null default 60,
  created_at    timestamptz not null default now()
);

-- ---------- what is sold ----------
create table services (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  name              text not null,
  description       text,
  duration_minutes  int  not null check (duration_minutes > 0),
  turnaround_minutes int not null default 0 check (turnaround_minutes >= 0),
  price_cents       int  not null check (price_cents >= 0),  -- ZAR cents. Never floats.
  active            boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------- who and what performs it ----------
create table staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  google_calendar_id text,          -- for Phase 3 sync
  active       boolean not null default true
);

create table resources (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,        -- 'Massage Room 1', 'Pedicure Chair A'
  active       boolean not null default true
);

-- which staff can perform which service
create table staff_services (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- which resources a service can use (any one of them)
create table service_resources (
  service_id  uuid not null references services(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (service_id, resource_id)
);
-- A service with NO rows here requires no resource. That is valid and common
-- (e.g. a consultation). Do not treat the empty set as an error.

-- ---------- when ----------
create table working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

create table availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid references staff(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  check (ends_at > starts_at),
  check (num_nonnulls(staff_id, resource_id) = 1)   -- blocks exactly one thing
);
-- Used for: leave, sick days, public holidays, "closed Monday", equipment out of service.

create index on availability_blocks (staff_id, starts_at);
create index on availability_blocks (resource_id, starts_at);

-- ---------- customers ----------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  phone       text not null,        -- E.164, normalised. This is the identity key.
  email       text,
  notes       text,                 -- owner-visible only
  created_at  timestamptz not null default now(),
  unique (business_id, phone)
);

-- ---------- the booking ----------
create type appointment_status as enum
  ('pending','confirmed','cancelled','completed','no_show');

create table appointments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id) on delete cascade,
  service_id     uuid not null references services(id),
  staff_id       uuid not null references staff(id),
  resource_id    uuid references resources(id),          -- null if none required
  customer_id    uuid not null references customers(id),

  starts_at      timestamptz not null,   -- customer-facing start
  ends_at        timestamptz not null,   -- customer-facing end (start + duration)
  blocks_until   timestamptz not null,   -- ends_at + turnaround. Calendar occupancy.

  status         appointment_status not null default 'confirmed',
  source         text not null default 'web',            -- 'web' | 'admin' | 'walkin'
  manage_token   text not null unique,                   -- for customer cancel/reschedule
  price_cents_at_booking int not null,                   -- price may change later
  notes          text,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,

  -- NOT IN SPEC §3, REQUIRED BY SPEC §5 + acceptance test 6.
  -- §5 says the key is "generated client-side per booking attempt and stored",
  -- but §3's table has nowhere to store it. Nullable because admin walk-ins and
  -- the reschedule-created row have no client attempt behind them; Postgres
  -- permits many NULLs under a unique constraint, which is what we want.
  idempotency_key text,

  -- Set when this row was created by rescheduling another. Lets the manage page
  -- and the audit trail follow a booking across moves (§6 preserves customer_id).
  rescheduled_from uuid references appointments(id),

  check (ends_at > starts_at),
  check (blocks_until >= ends_at),
  unique (business_id, idempotency_key)
);

-- THE MOST IMPORTANT LINES IN THIS FILE ------------------------------------
-- Application-level "check then insert" cannot prevent double bookings.
-- Two requests one millisecond apart both pass the check and both insert.
-- Postgres must refuse the overlap atomically.

alter table appointments add constraint no_staff_overlap
  exclude using gist (
    staff_id     with =,
    tstzrange(starts_at, blocks_until) with &&
  ) where (status in ('pending','confirmed'));

alter table appointments add constraint no_resource_overlap
  exclude using gist (
    resource_id  with =,
    tstzrange(starts_at, blocks_until) with &&
  ) where (status in ('pending','confirmed'));
-- NULL resource_id never conflicts. That is the desired behaviour.
-- ---------------------------------------------------------------------------

create index on appointments (business_id, starts_at);
create index on appointments (customer_id);

-- ---------- audit ----------
create table appointment_events (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  event          text not null,       -- created | confirmed | rescheduled | cancelled | completed | no_show
  actor          text not null,       -- 'customer' | 'admin' | 'system'
  detail         jsonb,
  created_at     timestamptz not null default now()
);

create index on appointment_events (appointment_id, created_at);

-- ---------- admin identity ----------
-- NOT IN SPEC §3, REQUIRED BY SPEC §7.
-- §7 requires the `authenticated` role to have "full access scoped to their
-- business_id, enforced in the policy — never in application code". A policy
-- cannot scope anything without a mapping from auth.uid() to a business, and
-- §3 defines none. This is the smallest table that closes that gap.
create table business_members (
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);

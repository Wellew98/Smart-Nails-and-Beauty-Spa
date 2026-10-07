-- ---------------------------------------------------------------------------
-- Party size on appointments (Townhouse-style "how many people are coming").
--
-- The studio takes mothers-and-daughters and small groups, and the diary
-- needs to show at a glance that 12:00 is three people, not one. One row
-- still holds one slot: the whole party gets the same treatment in the same
-- visit, and the owner arranges chairs around it. Groups of 7+ book by
-- phone, so the online flow only ever writes 1–6 (enforced in the API).
--
-- Nullable-with-default would leave two meanings for "no value"; NOT NULL
-- DEFAULT 1 backfills the existing rows as single bookings, which is what
-- they are.
-- ---------------------------------------------------------------------------

alter table appointments
  add column if not exists party_size int not null default 1
    check (party_size >= 1);

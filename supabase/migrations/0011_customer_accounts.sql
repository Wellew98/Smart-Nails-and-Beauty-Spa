-- ---------------------------------------------------------------------------
-- Outcomes build (video systems): customer accounts + automated email state.
-- Applies to the DESKTOP COPY only. The live project does not have this file.
-- ---------------------------------------------------------------------------

-- Build 1 (Clerk accounts): link a salon customer row to a Clerk user.
-- Nullable because every existing row (and every guest booking) has none;
-- it is filled when a signed-in customer books or claims by email.
alter table customers add column clerk_user_id text unique;

-- Build 2 (automated emails): send-state so crons never double-send.
-- reminder_sent_at: the 24h reminder went out for this appointment.
alter table appointments add column reminder_sent_at timestamptz;

-- winback_sent_at: the "we miss you" mail went out to this customer.
alter table customers add column winback_sent_at timestamptz;

create index on appointments (status, starts_at) where reminder_sent_at is null;

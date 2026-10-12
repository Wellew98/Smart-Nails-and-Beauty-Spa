-- ---------------------------------------------------------------------------
-- Outcomes build: WhatsApp owner alerts via store-and-forward outbox.
-- The sender runs on the salon PC (behind NAT, no public URL), so it cannot
-- receive webhooks. Instead the booking API queues alerts here and the
-- sender (wa-sender/) polls GET /api/wa/outbox and acks. Email stays the
-- reliable channel; this table is best-effort. Desktop copy only.
-- ---------------------------------------------------------------------------

create table wa_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  to_phone text not null,
  body text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index on wa_outbox (status, created_at) where status = 'pending';

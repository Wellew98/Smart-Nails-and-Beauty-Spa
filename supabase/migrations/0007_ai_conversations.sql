-- ---------------------------------------------------------------------------
-- Transcripts of the public AI assistant's conversations.
--
-- ---------------------------------------------------------------------------
-- THIS REVERSES AN EARLIER DECISION. READ THIS BEFORE CHANGING ANYTHING HERE.
--
-- Until this migration the assistant deliberately stored nothing: the
-- conversation lived in React state and closing the tab was the retention
-- policy. That was the right default while nobody had a use for a transcript.
-- The owner now does — she wants to see what people ask, which treatments they
-- ask for that are not on the menu, and where a conversation stopped short of a
-- booking. There is no way to answer any of that without keeping the words.
--
-- So this is a NEW STORE OF PERSONAL INFORMATION, and every part of the design
-- below exists to keep it the smallest one that answers the question.
--
-- WHAT IS STORED
--   Only what the customer typed and what the assistant replied. Not the tool
--   calls, not the tool results, and not the synthetic turns the route writes
--   to narrate a completed booking — those are machinery, they are noisy in a
--   transcript, and `[The booking was written to the database...]` is not
--   something anybody said.
--
-- WHAT IS NOT STORED, AND WHY IT IS STRUCTURAL
--   Name, phone and the manage token arrive in the request envelope and are
--   handed straight to lib/booking.ts. They are never inside `messages`, so
--   they cannot reach this table by any path — there is no redaction rule here
--   to get broken later, because there is nothing to redact.
--
--   The one thing that defeats that: a customer typing "my number is 082..."
--   into the box. Nothing can stop them, and this table will hold it. That is
--   the honest reason for the retention window below rather than a longer one.
--
-- NO IP, NO SESSION, NO FINGERPRINT. This table cannot say who was talking
-- unless the conversation ended in a booking, in which case `customer_id` says
-- so on purpose — see below.
-- ---------------------------------------------------------------------------

create table if not exists ai_conversations (
  -- Minted by the browser, once per chat window, and echoed on each turn.
  --
  -- Server-minting and returning it would be the same trust: either way the
  -- client hands the id back, so either way a visitor could send somebody
  -- else's. What makes that not matter is that this id is a random v4 and
  -- nothing reads a conversation back to the browser — the only read surface
  -- is the owner's own admin screen. The worst a guessed id achieves is
  -- appending noise to a transcript, bounded by the rate limiter.
  id            uuid        primary key,
  business_id   uuid        not null references businesses(id) on delete cascade,

  -- Set only when a booking is made in this conversation, and this is what
  -- puts the transcript inside the reach of §9.4 "delete my details".
  -- `forgetCustomer` deletes these rows. Without it the erasure path would
  -- empty the customers row and leave the conversation that named them.
  --
  -- ON DELETE SET NULL rather than CASCADE: a customer row is anonymised, not
  -- deleted, so this fires only if a customer is ever hard-deleted — and then
  -- the right outcome is an orphaned transcript that identifies nobody, not a
  -- silent second deletion.
  customer_id   uuid        references customers(id) on delete set null,

  started_at        timestamptz not null default now(),
  -- What retention is measured from, and what the admin list sorts by. A
  -- conversation resumed after a week is a week old, not a fresh one.
  last_message_at   timestamptz not null default now(),
  -- Denormalised so the list screen does not count rows per conversation.
  message_count     int         not null default 0,
  -- Whether this conversation produced a booking. The owner's first question
  -- of any transcript is "did we get it?", and answering it from the messages
  -- would mean reading them.
  booked            boolean     not null default false
);

create table if not exists ai_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid        not null references ai_conversations(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  created_at      timestamptz not null default now()
);

-- The admin list: newest conversation first.
create index if not exists ai_conversations_last_message_idx
  on ai_conversations (business_id, last_message_at desc);

-- Retention prunes by age across every business, so it needs the bare column
-- and not the composite above.
create index if not exists ai_conversations_age_idx
  on ai_conversations (last_message_at);

-- Reading one transcript in order, and the cascade behind a pruned conversation.
create index if not exists ai_messages_conversation_idx
  on ai_messages (conversation_id, id);

-- ---------------------------------------------------------------------------
-- Privileges — the same shape as 0005, and for the same reason.
--
-- Supabase's default privileges hand new public-schema tables to `anon` and
-- `authenticated`. For THIS table that would mean any visitor could read every
-- conversation every other visitor has had, which is the worst outcome
-- available in this schema. Only the server-side `pg` connection touches it:
-- the chat route writes, and the admin screen reads after `requireOwner()`.
--
-- RLS is enabled with NO policies as the second lock, exactly as 0002 revokes
-- grants in front of its policies rather than relying on either alone.
-- ---------------------------------------------------------------------------

alter table ai_conversations enable row level security;
alter table ai_messages      enable row level security;

revoke all on ai_conversations from anon;
revoke all on ai_conversations from authenticated;
revoke all on ai_messages      from anon;
revoke all on ai_messages      from authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting for the public AI assistant.
--
-- WHY A TABLE AND NOT A MAP IN MEMORY
-- Each Vercel instance gets its own module scope and instances scale out with
-- traffic, so a per-instance counter enforces nothing: twenty instances means
-- twenty times the limit, and the harder the abuse the more instances there
-- are. The counter has to live where every instance can see it, and this
-- project already has exactly one such place — the Postgres it books
-- appointments in. A hosted rate limiter would be a paid dependency and a new
-- external failure mode for a spa in Glenanda.
--
-- WHY FIXED WINDOWS AND A COUNTER, NOT A ROW PER REQUEST
-- A row per request would be a write per message plus a range scan per check,
-- and it would keep a timestamped record of every visitor's activity for as
-- long as the window. Counting into a bucket costs one upsert, keeps no
-- history, and is exactly as accurate as this needs to be: the boundary effect
-- of a fixed window lets a determined visitor send up to two windows' worth
-- across one boundary, which for "20 chat messages per 10 minutes" is not a
-- threat model worth a sliding log.
--
-- WHAT IS STORED, AND WHY IT IS NOT AN IP ADDRESS
-- An IP address is personal information under POPIA. `bucket` holds a salted
-- SHA-256 of it, never the address, so this table cannot be turned back into a
-- list of who visited — and the rows are pruned within days regardless. See
-- lib/ai/rate-limit.ts for the salt.
--
-- IF EVERY COUNTER SUDDENLY READS ZERO, THIS IS WHY. The salt falls back to
-- SUPABASE_DB_URL when AI_RATE_LIMIT_SALT is unset, so ROTATING THE DATABASE
-- PASSWORD CHANGES EVERY BUCKET KEY and the old rows become unreachable — every
-- visitor silently starts a fresh window. Harmless once, and it self-corrects
-- within a day when the orphans are pruned, but it looks like a broken limiter
-- if you are debugging it cold. Set AI_RATE_LIMIT_SALT explicitly to decouple
-- the two. The fallback is deliberate all the same: an unsalted hash of an IPv4
-- address is no protection at all, and this way a deployment that forgot one
-- more variable cannot silently degrade to one.
--
-- THE ONLY NEW TABLE THIS FEATURE ADDS. It holds no personal data, no
-- conversations and no bookings.
-- ---------------------------------------------------------------------------

create table if not exists ai_rate_limit (
  bucket       text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (bucket, window_start)
);

-- Pruning scans by age, not by bucket.
create index if not exists ai_rate_limit_window_start_idx on ai_rate_limit (window_start);

-- ---------------------------------------------------------------------------
-- Privileges.
--
-- Supabase's default privileges hand new public-schema tables to `anon` and
-- `authenticated`, which for this table would mean any visitor could read the
-- limiter's state or write their own counter back down. Only the server-side
-- `pg` connection touches it, and that role bypasses RLS, so the correct
-- surface for everyone else is none at all.
--
-- RLS is enabled with NO policies as the second lock, exactly as 0002 revokes
-- grants in front of its policies rather than relying on either alone.
-- ---------------------------------------------------------------------------

alter table ai_rate_limit enable row level security;

revoke all on ai_rate_limit from anon;
revoke all on ai_rate_limit from authenticated;

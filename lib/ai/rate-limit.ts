import 'server-only';
import { createHash } from 'node:crypto';
import { query } from '../db';
import type { EnvLike } from './types';

/**
 * Rate limiting for the public chat route, counted in Postgres.
 *
 * ---------------------------------------------------------------------------
 * THE THING THIS PROTECTS
 *
 * A public chatbot on a free-tier API key is the most abusable surface in this
 * project. The key has a hard daily ceiling, and one bored visitor with a loop
 * can spend the whole day's allowance in a few minutes — after which every
 * real customer gets the unavailable message until midnight. That is a worse
 * outcome than having no assistant, so the limits err towards refusing.
 *
 * TWO INDEPENDENT LIMITS, because they protect different things:
 *
 *   PER IP    stops one visitor being a nuisance.
 *   GLOBAL    stops one visitor spending everyone else's day. Per-IP limits
 *             alone do not do this — a hundred IPs inside their limits still
 *             exhaust the key.
 *
 * WHY IT FAILS CLOSED. If this check cannot run, the assistant is refused. It
 * is tempting to fail open so a database hiccup does not cost the feature, but
 * the failure this exists to prevent is exactly the one where something is
 * already going wrong. The cost of failing closed is a customer seeing "use
 * the booking page"; the cost of failing open is the day's quota. `/book` is
 * unaffected either way, and if Postgres is genuinely down the assistant has
 * nothing to answer with regardless — every tool reads the same database.
 * ---------------------------------------------------------------------------
 */

export interface Limits {
  /** Requests per IP per 10 minutes. */
  burst: number;
  /** Requests per IP per hour. */
  hourly: number;
  /** Requests from everyone, per day. Protects the provider's daily ceiling. */
  dailyGlobal: number;
}

export const DEFAULT_LIMITS: Limits = { burst: 20, hourly: 100, dailyGlobal: 1200 };

const BURST_WINDOW_MS = 10 * 60_000;
const HOURLY_WINDOW_MS = 60 * 60_000;
const DAILY_WINDOW_MS = 24 * 60 * 60_000;

/** Rows older than this are pruned. Two days covers the longest window twice. */
const RETENTION_MS = 2 * DAILY_WINDOW_MS;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function limitsFrom(env: EnvLike = process.env): Limits {
  return {
    burst: positiveInt(env.AI_RATE_LIMIT_BURST, DEFAULT_LIMITS.burst),
    hourly: positiveInt(env.AI_RATE_LIMIT_HOURLY, DEFAULT_LIMITS.hourly),
    dailyGlobal: positiveInt(env.AI_RATE_LIMIT_DAILY_GLOBAL, DEFAULT_LIMITS.dailyGlobal),
  };
}

/**
 * Which visitor this is, without recording who they are.
 *
 * An IP address is personal information under POPIA — it is in the same class
 * as the phone number the privacy notice already covers. Hashing it with a
 * server-side secret gives a stable bucket key that nobody can turn back into
 * an address, including us, and including anyone who ends up with a copy of
 * the table. Unsalted would be no protection at all: the whole IPv4 space can
 * be hashed in seconds.
 *
 * The salt falls back to the database URL — already a server-only secret that
 * every deployment has — so this cannot silently degrade to an unsalted hash
 * on a deployment that forgot one more environment variable.
 *
 * THE COST OF THAT FALLBACK: rotating the database password changes every
 * bucket key, so every counter appears to reset to zero at once. Harmless, and
 * it self-corrects when the orphaned rows are pruned, but it is a surprising
 * coupling between two unrelated things and it looks like a broken limiter to
 * anyone debugging it cold. Set AI_RATE_LIMIT_SALT explicitly to decouple them.
 */
export function bucketFor(ip: string | null, env: EnvLike = process.env): string {
  const salt = env.AI_RATE_LIMIT_SALT ?? env.SUPABASE_DB_URL ?? env.TEST_DATABASE_URL ?? 'smart-nails';
  // No IP at all is bucketed together deliberately. Sharing one bucket is the
  // safe direction: it limits harder, never softer.
  const subject = ip?.trim() || 'unknown';
  return createHash('sha256').update(`${salt}:${subject}`).digest('hex').slice(0, 32);
}

/**
 * The client's address, as far as it can be trusted.
 *
 * `x-forwarded-for` is a client-supplied header everywhere except behind a
 * proxy that overwrites it, which Vercel does — it appends the real peer last
 * on its own hop. Taking the FIRST entry is the convention, and it is also the
 * spoofable one; the global daily cap exists precisely because per-IP limits
 * can be evaded and must not be the only thing standing between a visitor and
 * the day's quota.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || null;
}

export type RateLimitReason = 'ip_burst' | 'ip_hourly' | 'global_daily' | 'unavailable';

export interface RateLimitVerdict {
  allowed: boolean;
  reason?: RateLimitReason;
}

function windowStart(now: number, sizeMs: number): Date {
  return new Date(Math.floor(now / sizeMs) * sizeMs);
}

/**
 * Count one request against every limit, then decide.
 *
 * Counting happens BEFORE the decision and for all three buckets at once, in a
 * single statement. A refused request still counts, deliberately: a visitor
 * hammering the endpoint should not have their window reset by the refusals,
 * which is what "check, then increment only if allowed" would do.
 */
export async function consume(
  ip: string | null,
  options: { env?: EnvLike; now?: Date } = {},
): Promise<RateLimitVerdict> {
  const env = options.env ?? process.env;
  const now = (options.now ?? new Date()).getTime();
  const limits = limitsFrom(env);
  const subject = bucketFor(ip, env);

  const buckets = [
    { key: `burst:${subject}`, start: windowStart(now, BURST_WINDOW_MS), limit: limits.burst, reason: 'ip_burst' as const },
    { key: `hourly:${subject}`, start: windowStart(now, HOURLY_WINDOW_MS), limit: limits.hourly, reason: 'ip_hourly' as const },
    { key: 'global', start: windowStart(now, DAILY_WINDOW_MS), limit: limits.dailyGlobal, reason: 'global_daily' as const },
  ];

  try {
    const rows = await query<{ bucket: string; count: number }>(
      `insert into ai_rate_limit (bucket, window_start, count)
       select b.bucket, b.window_start, 1
         from unnest($1::text[], $2::timestamptz[]) as b(bucket, window_start)
       on conflict (bucket, window_start)
         do update set count = ai_rate_limit.count + 1
       returning bucket, count`,
      [buckets.map((b) => b.key), buckets.map((b) => b.start.toISOString())],
    );

    const counts = new Map(rows.map((row) => [row.bucket, Number(row.count)]));

    // Ordered so the customer is told the most specific true thing: their own
    // burst before their hour, and either before "everyone is busy".
    for (const bucket of buckets) {
      const used = counts.get(bucket.key) ?? 0;
      if (used > bucket.limit) return { allowed: false, reason: bucket.reason };
    }

    await pruneOccasionally(now);
    return { allowed: true };
  } catch (error) {
    // Operational only — never the address, hashed or otherwise.
    console.error('[ai] rate limit check failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { allowed: false, reason: 'unavailable' };
  }
}

/**
 * Old buckets are dead weight, but pruning on every request would add a delete
 * to the hot path for rows nobody reads. One in fifty is often enough to keep
 * the table small and rare enough to cost nothing.
 */
async function pruneOccasionally(now: number): Promise<void> {
  if (Math.random() > 0.02) return;
  try {
    await query('delete from ai_rate_limit where window_start < $1', [
      new Date(now - RETENTION_MS).toISOString(),
    ]);
  } catch {
    // Housekeeping. A failure here must never cost a customer their answer.
  }
}

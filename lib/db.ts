import 'server-only';
import { Pool, type PoolClient } from 'pg';
import type { Queryable } from './types';

/**
 * Server-side Postgres access for the booking engine.
 *
 * ---------------------------------------------------------------------------
 * DEVIATION FROM SPEC §5/§11, DELIBERATE — read this before "simplifying" it.
 *
 * The spec says the write path runs "with the Supabase service role key", and
 * §11 lists no database URL. We use a direct Postgres connection instead, for
 * three reasons that all come from the spec itself:
 *
 *   1. §6 requires reschedule to "cancel the old row and create a new one in
 *      ONE TRANSACTION". supabase-js speaks to PostgREST over HTTP and cannot
 *      open a transaction across two statements. There is no way to satisfy
 *      §6 through it.
 *   2. §5 step 8 requires catching SQLSTATE 23P01 specifically. node-postgres
 *      exposes `err.code === '23P01'` directly; PostgREST reshapes the error
 *      and the code is not reliably recoverable.
 *   3. §9 test 1 fires 20 simultaneous writes and asserts exactly one wins.
 *      That needs a real connection pool against real Postgres.
 *
 * The security property the spec actually cares about is preserved exactly:
 * this module is `server-only`, the credential is never NEXT_PUBLIC_, and the
 * browser never writes to `appointments`. Public reads still go through the
 * anon key with RLS (lib/supabase/*), so acceptance test 8 tests the real
 * policies.
 *
 * Supabase gives you this connection string under
 * Project Settings > Database > Connection string > Node.js.
 * ---------------------------------------------------------------------------
 */

function connectionString(): string {
  const url = process.env.SUPABASE_DB_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is not set.\n' +
        (process.env.VERCEL
          ? '  On Vercel: Settings > Environment Variables. Use the TRANSACTION POOLER\n' +
            '  string from Supabase > Connect (port 6543), not the direct connection —\n' +
            '  direct connections are IPv6-only and Vercel builds are IPv4.\n' +
            '  Then redeploy; env vars do not apply to an existing build.'
          : '  Locally: copy .env.example to .env.local and fill it in\n' +
            '  (Supabase > Connect, or Project Settings > Database).'),
    );
  }
  return url;
}

/**
 * Turn a connection failure into something actionable.
 *
 * The pages under app/ are prerendered, so the FIRST thing a deploy does is
 * query the database — and a bare `ECONNREFUSED` or `ENOTFOUND` at
 * "Collecting page data" gives no clue which of the several plausible causes it
 * is. Each of these has bitten a real deploy of this app.
 */
function describeConnectionFailure(error: unknown, url: string): string {
  const code = (error as { code?: string } | null)?.code;
  const usingDirect = /db\.[a-z0-9]+\.supabase\.co/i.test(url);

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return usingDirect
      ? 'Could not resolve the Supabase host. This is the DIRECT connection string, which is ' +
          'IPv6-only — Vercel build machines are IPv4. Use the Transaction pooler string ' +
          '(Supabase > Connect, port 6543) instead.'
      : 'Could not resolve the database host. Check SUPABASE_DB_URL for a typo.';
  }
  if (code === 'ECONNREFUSED') {
    return 'The database refused the connection. If this is a free Supabase project it may be ' +
      'PAUSED after inactivity — open the dashboard to resume it.';
  }
  if (code === 'ETIMEDOUT') {
    return 'Timed out reaching the database. If this is the direct connection string, switch to ' +
      'the Transaction pooler (port 6543).';
  }
  if (code === '28P01') {
    return 'Password rejected. Copy the connection string again from Supabase > Connect; the ' +
      'password placeholder has to be replaced with the real database password.';
  }
  return '';
}

// Next.js reloads modules in dev; without this every save leaks a pool.
const globalForPool = globalThis as unknown as { __spaPool?: Pool };

/**
 * How many connections one pool may hold.
 *
 * On a long-running server, one process serves every request and a pool of ~10
 * is right. On Vercel each serverless instance gets its OWN pool, and instances
 * scale out with traffic — 10 apiece exhausts Postgres' connection limit fast,
 * and the symptom is "too many clients already" under exactly the load you most
 * wanted to handle. Small pools per instance, with Supabase's pooler in front,
 * is the shape that survives.
 *
 * The advisory lock in lib/booking.ts is `pg_advisory_xact_lock`, transaction
 * scoped rather than session scoped, so it is safe through a transaction-mode
 * pooler. A session-scoped lock would not be.
 */
function poolSize(): number {
  const explicit = process.env.PGPOOL_MAX;
  if (explicit) return Number(explicit);
  return process.env.VERCEL ? 2 : 10;
}

export function getPool(): Pool {
  if (!globalForPool.__spaPool) {
    const url = connectionString();
    globalForPool.__spaPool = new Pool({
      connectionString: url,
      max: poolSize(),
      // Serverless instances are frozen between requests; a long idle timeout
      // holds connections that nobody is using.
      idleTimeoutMillis: process.env.VERCEL ? 10_000 : 30_000,
      connectionTimeoutMillis: 15_000,
      // Supabase requires TLS; a local socket/localhost test database does not.
      ssl: /supabase|amazonaws/i.test(url) ? { rejectUnauthorized: false } : undefined,
    });

    // A pool error with no listener takes the process down. Log and let the
    // pool discard the connection instead.
    globalForPool.__spaPool.on('error', (error) => {
      console.error('[db] idle client error', error);
    });
  }
  return globalForPool.__spaPool;
}

// Not constrained to Record<string, unknown>: a TypeScript interface has no
// implicit index signature, so that constraint would reject every domain type
// in lib/types.ts and push us into declaring index signatures we do not want.
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await getPool().query(text, params as never[]);
    return result.rows as T[];
  } catch (error) {
    throw explainIfConnectionFailure(error);
  }
}

/**
 * Re-throw connection failures with the diagnosis attached, leaving query
 * errors (constraint violations especially) exactly as they were — the write
 * path matches on SQLSTATE 23P01 and must keep seeing the original error.
 */
function explainIfConnectionFailure(error: unknown): unknown {
  const explanation = describeConnectionFailure(
    error,
    process.env.SUPABASE_DB_URL ?? process.env.TEST_DATABASE_URL ?? '',
  );
  if (!explanation) return error;

  const wrapped = new Error(
    `${explanation}\n  (original: ${(error as Error)?.message ?? String(error)})`,
  );
  (wrapped as { cause?: unknown }).cause = error;
  return wrapped;
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

async function runTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // The connection is already broken; the pool will discard it.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` inside a single transaction, retrying if Postgres aborts it for a
 * lock-ordering reason. Commits on return, rolls back on throw.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RETRY EXISTS, AND WHY IT IS NOT THE THING §5 STEP 8 FORBIDS
 *
 * `appointments` carries TWO exclusion constraints. Concurrent inserts can
 * therefore deadlock without either row being invalid:
 *
 *     tx A inserts (staff=Sarah, resource=Chair)
 *     tx B inserts (staff=Nomsa, resource=Chair)
 *     A passes the staff check, reaches the resource check, sees B's
 *       uncommitted index entry, and waits for B.
 *     B does exactly the same and waits for A.
 *     -> deadlock, and Postgres shoots one of them (SQLSTATE 40P01).
 *
 * That abort says nothing about whether the slot is free — it is an artefact
 * of two transactions visiting two indexes in opposite orders. Re-running the
 * whole transaction (which re-checks availability from scratch) is the correct
 * response, and nothing was committed, so it is safe.
 *
 * This is NOT "retry blindly on exclusion_violation". A 23P01 means the slot is
 * genuinely taken and is never retried — it propagates to the caller and
 * becomes a 409, exactly as §5 step 8 requires.
 * ---------------------------------------------------------------------------
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: { retries?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 4;

  for (let attempt = 0; ; attempt++) {
    try {
      return await runTransaction(fn);
    } catch (error) {
      if (attempt >= retries || !isRetryableTransactionError(error)) throw error;
      // Small jittered backoff so the racers do not immediately re-collide in
      // the same order.
      const delay = Math.random() * 10 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Postgres SQLSTATE for exclusion_violation — spec §5 step 8. Never retried. */
export const EXCLUSION_VIOLATION = '23P01';
/** Postgres SQLSTATE for unique_violation — used by idempotency handling. */
export const UNIQUE_VIOLATION = '23505';
/** Postgres SQLSTATE for check_violation — the vouchers `balance_cents` bounds. */
export const CHECK_VIOLATION = '23514';
/** Lock-ordering aborts. Safe to retry: nothing was committed. */
export const DEADLOCK_DETECTED = '40P01';
export const SERIALIZATION_FAILURE = '40001';

function sqlState(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as { code?: string }).code;
}

export function isRetryableTransactionError(error: unknown): boolean {
  const code = sqlState(error);
  return code === DEADLOCK_DETECTED || code === SERIALIZATION_FAILURE;
}

export function isExclusionViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === EXCLUSION_VIOLATION;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export function isCheckViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === CHECK_VIOLATION;
}

/** Which constraint did Postgres reject on? Lets the UI name the clash (§7.1). */
export function violatedConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  return (error as { constraint?: string }).constraint ?? null;
}

/**
 * Serialise writes for one business, for the life of the transaction. MUST be
 * the first statement after BEGIN.
 *
 * Lives here, not in lib/booking.ts, so that lib/vouchers.ts can take
 * EXACTLY the same lock rather than a lock of its own — the vouchers build
 * spec (§3) is explicit about this: "the same lock lib/booking.ts uses,
 * deliberately the same lock rather than a per-voucher one," because the
 * moment a cancellation needs to touch both an appointment and a voucher, two
 * lock namespaces become an ordering problem, and a deadlock storm in this
 * codebase already cost real debugging time once (see HANDOFF §3/§6).
 *
 * ---------------------------------------------------------------------------
 * WHY: `appointments` carries two exclusion constraints. Two concurrent
 * inserts can each pass one constraint and then block on the other's
 * uncommitted index entry, in opposite orders — a genuine deadlock, even
 * though neither row is invalid. Postgres resolves it, but only after waiting
 * a full `deadlock_timeout` (1s by default) before it even looks for a cycle.
 * Under real contention those one-second penalties compound badly: a burst of
 * twenty racers on one slot took over a minute, versus a few milliseconds
 * uncontended.
 *
 * Taking a single lock per business up front gives every writer the same
 * ordering, so the cycle cannot form and nobody pays the deadlock timeout.
 * The lock is released automatically on commit or rollback.
 *
 * WHAT THIS IS NOT: it is not the thing that prevents double booking or
 * voucher overspend. The exclusion constraints and the `balance_cents >= 0`
 * check are what actually enforce correctness; this only removes lock-order
 * nondeterminism and gives every writer for a business the same queue.
 *
 * COST: appointment and voucher writes for one business serialise with each
 * other. Both are sub-millisecond and this is a single-salon product, so the
 * ceiling is orders of magnitude above real demand.
 * ---------------------------------------------------------------------------
 */
export async function lockBusinessForWrite(client: Queryable, businessId: string): Promise<void> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [businessId]);
}

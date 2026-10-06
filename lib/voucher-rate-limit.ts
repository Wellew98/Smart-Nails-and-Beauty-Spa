import 'server-only';
import { query } from './db';
import { bucketFor } from './ai/rate-limit';

/**
 * The client's address, as far as it can be trusted — same reasoning as
 * `clientIp` in lib/ai/rate-limit.ts, duplicated in miniature rather than
 * imported: that one is typed against a route handler's `Headers`, and this
 * one is read in a server component from `next/headers`' `ReadonlyHeaders`,
 * which is not structurally a `Headers`. A `.get(name)` duck type is all
 * either caller actually needs.
 */
export function voucherLookupIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || null;
}

/**
 * Rate limiting for `/v/[token]`, the public voucher balance page.
 *
 * Spec §6.2: "Migration 0005_ai_rate_limit.sql established the pattern —
 * reuse it, keyed on IP. The token has full entropy so this is defence in
 * depth rather than the primary control, but it costs nothing."
 *
 * Reuses the `ai_rate_limit` TABLE the chat assistant already counts into,
 * under its own bucket prefix so the two features cannot interfere with each
 * other's counts. Deliberately simpler than `lib/ai/rate-limit.ts`'s three
 * layered limits (burst/hourly/global) — that shape exists to protect a paid
 * API key's daily ceiling, which nothing here shares. One IP, one hourly
 * window, is the whole threat model §6.2 describes.
 */

const WINDOW_MS = 60 * 60_000;
const LIMIT = 20;

function windowStart(now: number): Date {
  return new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
}

/**
 * Same fail-closed stance as the chat limiter, and for the same reason: if
 * the check itself cannot run, refusing a balance lookup costs a customer one
 * page load, while failing open on a broken limiter defeats the entire point
 * of having one.
 */
export async function consumeVoucherLookup(ip: string | null, now: Date = new Date()): Promise<boolean> {
  const bucket = `voucher_lookup:${bucketFor(ip)}`;
  try {
    const rows = await query<{ count: number }>(
      `insert into ai_rate_limit (bucket, window_start, count)
       values ($1, $2, 1)
       on conflict (bucket, window_start)
         do update set count = ai_rate_limit.count + 1
       returning count`,
      [bucket, windowStart(now.getTime()).toISOString()],
    );
    const used = Number(rows[0]?.count ?? 1);
    return used <= LIMIT;
  } catch (error) {
    console.error('[vouchers] rate limit check failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return false;
  }
}

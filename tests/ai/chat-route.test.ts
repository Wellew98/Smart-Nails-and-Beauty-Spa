import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/ai/chat/route';
import { query } from '@/lib/db';
import { resetDatabase } from '../helpers/fixtures';

/**
 * The refusal path of POST /api/ai/chat.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM rate-limit.test.ts
 *
 * That file proves `consume()` returns the right verdict. This one proves the
 * ROUTE acts on it — which is a different claim, and the one that matters. A
 * limiter that correctly computes "refuse" while the handler carries on and
 * calls the provider anyway is worse than no limiter, because it looks tested.
 *
 * The global cap is the one worth pinning hardest. Per-IP limits are evadable
 * by definition — anyone can cycle addresses — so the global cap is the only
 * thing standing between one determined visitor and the whole day's quota on a
 * metered free-tier key. Every request below comes from a DIFFERENT address,
 * each well inside its own per-IP allowance, so nothing but the global cap can
 * be doing the refusing.
 * ---------------------------------------------------------------------------
 */

const ORIGINAL = { ...process.env };

beforeEach(async () => {
  await resetDatabase();
  await query('truncate ai_rate_limit');
  // Per-IP limits lifted out of the way so only the global cap can refuse.
  process.env.AI_RATE_LIMIT_BURST = '1000';
  process.env.AI_RATE_LIMIT_HOURLY = '1000';
  process.env.AI_RATE_LIMIT_DAILY_GLOBAL = '5';
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function ask(ip: string): Promise<Response> {
  return POST(
    new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    }),
  );
}

interface Body {
  reply: string;
  degraded: boolean;
  bookUrl: string;
  attachments: unknown[];
}

describe('the global daily cap, through the route', () => {
  it('refuses a visitor cycling addresses, once the day is spent', async () => {
    const statuses: number[] = [];
    for (let visitor = 1; visitor <= 8; visitor++) {
      statuses.push((await ask(`41.20.9.${visitor}`)).status);
    }

    // Five through, then refused — from eight distinct addresses, none of which
    // came close to its own limit.
    expect(statuses.filter((status) => status !== 429)).toHaveLength(5);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
  });

  it('gives the refused customer a sentence and the booking page, not a bare 429', async () => {
    for (let visitor = 1; visitor <= 6; visitor++) await ask(`41.20.9.${visitor}`);

    const response = await ask('41.20.9.99');
    const body = (await response.json()) as Body;

    expect(response.status).toBe(429);
    expect(body.bookUrl).toBe('/book');
    expect(body.reply).toMatch(/booking page/i);
    // Never a provider name, a quota, or an HTTP status — §35. The customer
    // cannot act on whose fault it is; they can act on /book.
    expect(body.reply).not.toMatch(/gemini|quota|429|limit|api|token/i);
  });

  it('does not call the provider once it has refused', async () => {
    // The whole point of refusing is to stop spending the key. A refusal that
    // still costs a request protects nothing.
    for (let visitor = 1; visitor <= 6; visitor++) await ask(`41.20.9.${visitor}`);

    const body = (await (await ask('41.20.9.99')).json()) as Body;
    expect(body.attachments).toEqual([]);
    expect(body.degraded).toBe(true);
  });
});

describe('when the counter cannot be read', () => {
  it('refuses rather than passing the request through', async () => {
    // Fails CLOSED. It is tempting to let a database hiccup cost the limiter
    // rather than the feature, but the failure this exists to prevent is
    // exactly the one where something is already going wrong.
    await query('alter table ai_rate_limit rename to ai_rate_limit_hidden');
    try {
      const response = await ask('41.20.9.200');
      const body = (await response.json()) as Body;

      expect(response.status).toBe(429);
      expect(body.reply).toMatch(/booking page/i);
      expect(body.attachments).toEqual([]);
    } finally {
      await query('alter table ai_rate_limit_hidden rename to ai_rate_limit');
    }
  });

  it('recovers as soon as it can be read again', async () => {
    // Fail-closed must not mean fail-stuck.
    await query('alter table ai_rate_limit rename to ai_rate_limit_hidden');
    await ask('41.20.9.200');
    await query('alter table ai_rate_limit_hidden rename to ai_rate_limit');

    expect((await ask('41.20.9.201')).status).not.toBe(429);
  });
});

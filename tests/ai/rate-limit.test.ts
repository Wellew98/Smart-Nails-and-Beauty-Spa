import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db';
import { bucketFor, clientIp, consume, limitsFrom } from '@/lib/ai/rate-limit';

/**
 * Rate limiting (`lib/ai/rate-limit.ts`), against real Postgres.
 *
 * It has to be the real thing. The whole reason this is a table and not a Map
 * is that serverless instances do not share memory, so a test against an
 * in-process fake would be testing the shape of the bug rather than the fix.
 */

beforeEach(async () => {
  await query('truncate ai_rate_limit');
});

const env = {
  AI_RATE_LIMIT_BURST: '3',
  AI_RATE_LIMIT_HOURLY: '5',
  AI_RATE_LIMIT_DAILY_GLOBAL: '8',
  AI_RATE_LIMIT_SALT: 'test-salt',
};

describe('reading the limits', () => {
  it('takes them from the environment, with defaults that are not zero', () => {
    expect(limitsFrom(env)).toEqual({ burst: 3, hourly: 5, dailyGlobal: 8 });

    const defaults = limitsFrom({});
    expect(defaults.burst).toBeGreaterThan(0);
    expect(defaults.hourly).toBeGreaterThan(defaults.burst);
    expect(defaults.dailyGlobal).toBeGreaterThan(defaults.hourly);
  });

  it('ignores a value that is not a positive whole number', () => {
    // A typo in an environment variable must not silently remove the limit.
    for (const bad of ['0', '-5', 'lots', '', '2.5']) {
      expect(limitsFrom({ AI_RATE_LIMIT_BURST: bad }).burst).toBe(limitsFrom({}).burst);
    }
  });
});

describe('identifying a visitor without recording one', () => {
  it('never stores the address itself', () => {
    // An IP is personal information under POPIA, in the same class as the phone
    // number the privacy notice already covers.
    const bucket = bucketFor('102.65.14.9', env);
    expect(bucket).not.toContain('102.65.14.9');
    expect(bucket).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable for one visitor and different for another', () => {
    expect(bucketFor('102.65.14.9', env)).toBe(bucketFor('102.65.14.9', env));
    expect(bucketFor('102.65.14.9', env)).not.toBe(bucketFor('102.65.14.10', env));
  });

  it('is salted, so the address cannot be recovered by hashing every address', () => {
    // Unsalted this would be no protection at all: the whole IPv4 space can be
    // hashed in seconds.
    expect(bucketFor('102.65.14.9', { AI_RATE_LIMIT_SALT: 'a' })).not.toBe(
      bucketFor('102.65.14.9', { AI_RATE_LIMIT_SALT: 'b' }),
    );
  });

  it('falls back to a secret that every deployment already has', () => {
    // So a deployment that forgot one more variable cannot silently degrade to
    // an unsalted hash.
    expect(bucketFor('102.65.14.9', { SUPABASE_DB_URL: 'postgres://a' })).not.toBe(
      bucketFor('102.65.14.9', { SUPABASE_DB_URL: 'postgres://b' }),
    );
  });

  it('buckets an unknown address together, which limits harder rather than softer', () => {
    expect(bucketFor(null, env)).toBe(bucketFor('', env));
  });
});

describe('reading the address off the request', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '102.65.14.9, 10.0.0.1, 10.0.0.2' });
    expect(clientIp(headers)).toBe('102.65.14.9');
  });

  it('falls back to x-real-ip, then to nothing', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '102.65.14.9' }))).toBe('102.65.14.9');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('the per-IP limits', () => {
  it('allows up to the burst limit and refuses the next one', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await consume('102.65.14.9', { env })).toEqual({ allowed: true });
    }
    expect(await consume('102.65.14.9', { env })).toEqual({ allowed: false, reason: 'ip_burst' });
  });

  it('does not let one visitor spend another visitor\'s allowance', async () => {
    for (let attempt = 0; attempt < 4; attempt++) await consume('102.65.14.9', { env });
    expect(await consume('102.65.14.10', { env })).toEqual({ allowed: true });
  });

  it('counts refused requests too, so hammering does not reset the window', async () => {
    // "Check, then increment only if allowed" would let a visitor who is over
    // their limit keep their window from ever advancing.
    for (let attempt = 0; attempt < 6; attempt++) await consume('102.65.14.9', { env });

    const rows = await query<{ count: number }>(
      "select count from ai_rate_limit where bucket like 'burst:%'",
    );
    expect(Number(rows[0].count)).toBe(6);
  });

  it('starts a fresh window once the old one has passed', async () => {
    const now = new Date('2026-08-12T10:05:00Z');
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await consume('102.65.14.9', { env, now })).toEqual({ allowed: true });
    }
    expect(await consume('102.65.14.9', { env, now })).toMatchObject({ reason: 'ip_burst' });

    // Eleven minutes later is a different ten-minute bucket. Four requests have
    // been counted, so this is the fifth of the hour and the hourly limit of
    // five still has room for it.
    const later = new Date('2026-08-12T10:16:00Z');
    expect(await consume('102.65.14.9', { env, now: later })).toEqual({ allowed: true });
  });

  it('holds the hourly limit across several burst windows', async () => {
    // Seven minutes apart puts at most two requests in any ten-minute bucket,
    // so the burst limit of three is never the thing that refuses — and all
    // eight land inside the same clock hour. The daily cap is lifted out of the
    // way so only the hourly limit can be doing the work.
    const spacious = { ...env, AI_RATE_LIMIT_DAILY_GLOBAL: '500' };
    const base = Date.parse('2026-08-12T10:05:00Z');
    let allowed = 0;

    for (let attempt = 0; attempt < 8; attempt++) {
      const verdict = await consume('102.65.14.9', {
        env: spacious,
        now: new Date(base + attempt * 7 * 60_000),
      });
      if (verdict.allowed) allowed++;
      else expect(verdict.reason).toBe('ip_hourly');
    }

    expect(allowed).toBe(5);
  });

  it('resets at the hour boundary, which is what a fixed window means', async () => {
    // Stated rather than left implicit: a fixed window lets a determined
    // visitor send up to two windows' worth either side of a boundary. For
    // "20 chat messages per 10 minutes" that is not a threat worth a sliding
    // log, and this test is here so nobody later reads the boundary as a bug.
    const spacious = { ...env, AI_RATE_LIMIT_DAILY_GLOBAL: '500' };

    // Ten minutes apart: one per burst bucket, so only the hourly limit is in
    // play. The sixth of the hour is the one that goes over.
    const base = Date.parse('2026-08-12T10:05:00Z');
    let refused: string | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      const verdict = await consume('102.65.14.9', {
        env: spacious,
        now: new Date(base + attempt * 10 * 60_000),
      });
      if (!verdict.allowed) refused = verdict.reason;
    }
    expect(refused).toBe('ip_hourly');

    // Five minutes after that refusal, but in the next clock hour.
    expect(
      await consume('102.65.14.9', { env: spacious, now: new Date('2026-08-12T11:00:00Z') }),
    ).toEqual({ allowed: true });
  });
});

describe('the global daily cap', () => {
  it('stops one busy day exhausting the key for everyone', async () => {
    // Per-IP limits alone do not do this: a hundred visitors inside their own
    // limits still spend the whole day's allowance.
    const generous = { ...env, AI_RATE_LIMIT_BURST: '100', AI_RATE_LIMIT_HOURLY: '100' };

    let refusals = 0;
    for (let visitor = 0; visitor < 10; visitor++) {
      const verdict = await consume(`102.65.14.${visitor}`, { env: generous });
      if (!verdict.allowed) {
        expect(verdict.reason).toBe('global_daily');
        refusals++;
      }
    }

    expect(refusals).toBe(2); // 8 allowed, then the cap
  });

  it('does not fail open when the count cannot be read', async () => {
    // The failure this exists to prevent is exactly the one where something is
    // already going wrong. A customer seeing "use the booking page" costs less
    // than the day's quota — and if Postgres is down the assistant has nothing
    // to answer with anyway, since every tool reads the same database.
    await query('alter table ai_rate_limit rename to ai_rate_limit_hidden');
    try {
      expect(await consume('102.65.14.9', { env })).toEqual({
        allowed: false,
        reason: 'unavailable',
      });
    } finally {
      await query('alter table ai_rate_limit_hidden rename to ai_rate_limit');
    }
  });
});

describe('what the table keeps', () => {
  it('holds counters, not a record of anybody', async () => {
    await consume('102.65.14.9', { env });

    const rows = await query<{ bucket: string; count: number }>('select * from ai_rate_limit');
    expect(rows.length).toBe(3); // burst, hourly, global
    expect(JSON.stringify(rows)).not.toContain('102.65.14.9');
    expect(Object.keys(rows[0]).sort()).toEqual(['bucket', 'count', 'window_start']);
  });

  it('keeps the two IP windows apart even when they start at the same instant', async () => {
    // A ten-minute and a sixty-minute window share a boundary every hour. If
    // the window size were not part of the key they would collide there and
    // count into each other.
    const onTheHour = new Date('2026-08-12T11:00:00Z');
    await consume('102.65.14.9', { env, now: onTheHour });

    const rows = await query<{ bucket: string; count: number }>(
      'select bucket, count from ai_rate_limit order by bucket',
    );
    expect(rows.every((row) => Number(row.count) === 1)).toBe(true);
    expect(rows).toHaveLength(3);
  });
});

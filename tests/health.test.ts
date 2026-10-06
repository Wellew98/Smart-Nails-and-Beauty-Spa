import { describe, expect, it } from 'vitest';
import { checkAi, checkEnvironment, type EnvLike } from '@/lib/health';

/**
 * The checks behind GET /api/health.
 *
 * These exist as a unit test rather than a request against the running app
 * because NEXT_PUBLIC_* values are inlined at build time — overriding them at
 * runtime does nothing, so a test through the route would silently assert
 * against whatever was baked into the build. That is not a hypothetical: it is
 * how the secret-key warning below first appeared to pass while never running.
 */

const base = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://dxweozusaqtymivupswk.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
  SUPABASE_DB_URL: 'postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  NEXT_PUBLIC_SITE_URL: 'https://spa-two.vercel.app',
  OWNER_NOTIFICATION_EMAIL: 'grace@gracenails.co.za',
} satisfies EnvLike;

/** The deployment as it is actually going out: Gmail, no domain owned yet. */
const good = {
  ...base,
  GMAIL_USER: 'gracenailsspa@gmail.com',
  GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
} satisfies EnvLike;

/** The same deployment after a domain is bought and verified in Resend. */
const goodResend = {
  ...base,
  RESEND_API_KEY: 're_abc123',
  BOOKING_FROM_EMAIL: 'bookings@gracenails.co.za',
} satisfies EnvLike;

describe('a correctly configured deployment', () => {
  it('passes every check on Gmail', () => {
    const result = checkEnvironment(good);
    for (const [name, check] of Object.entries(result)) {
      expect(check.ok, `${name}: ${check.detail}`).toBe(true);
    }
  });

  it('passes every check on Resend', () => {
    const result = checkEnvironment(goodResend);
    for (const [name, check] of Object.entries(result)) {
      expect(check.ok, `${name}: ${check.detail}`).toBe(true);
    }
  });
});

describe('the secret-key warning', () => {
  // The one check here that is a security control rather than a convenience.
  // NEXT_PUBLIC_ ships this value to every visitor, and a secret key bypasses
  // every RLS policy — so anyone reading the page source could read and edit
  // the whole database.
  it('rejects an sb_secret_ key and says to rotate it', () => {
    const result = checkEnvironment({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc123' });
    const check = result.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/SECRET KEY/);
    expect(check.detail).toMatch(/rotate/i);
  });

  it('rejects a service-role JWT, which looks like any other JWT from outside', () => {
    // A real service_role key is a JWT whose payload carries role: service_role.
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;

    const check = checkEnvironment({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token })
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/SERVICE-ROLE KEY/);
  });

  it('accepts a genuine anon JWT', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;

    expect(
      checkEnvironment({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token })
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.ok,
    ).toBe(true);
  });
});

describe('the connection string', () => {
  it('rejects the direct string, which is IPv6-only and cannot be reached from Vercel', () => {
    const check = checkEnvironment({
      ...good,
      SUPABASE_DB_URL: 'postgresql://postgres:pw@db.dxweozusaqtymivupswk.supabase.co:5432/postgres',
    }).SUPABASE_DB_URL;

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/IPv6-only/);
    expect(check.detail).toMatch(/pooler/i);
  });

  it('catches the password placeholder copied straight from the dashboard', () => {
    const check = checkEnvironment({
      ...good,
      SUPABASE_DB_URL:
        'postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    }).SUPABASE_DB_URL;

    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/placeholder/i);
  });

  it('reports a missing one as fatal to every page that reads data', () => {
    const check = checkEnvironment({ ...good, SUPABASE_DB_URL: undefined }).SUPABASE_DB_URL;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/missing/);
  });
});

describe('the site URL', () => {
  it('rejects localhost, which would send customers a link to their own machine', () => {
    const check = checkEnvironment({ ...good, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' })
      .NEXT_PUBLIC_SITE_URL;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/localhost/);
  });
});

describe('the project URL', () => {
  it('rejects one that is not shaped like a Supabase project', () => {
    const check = checkEnvironment({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'dxweozusaqtymivupswk' })
      .NEXT_PUBLIC_SUPABASE_URL;
    expect(check.ok).toBe(false);
  });

  it('accepts a trailing slash, which is easy to paste in', () => {
    expect(
      checkEnvironment({ ...good, NEXT_PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co/' })
        .NEXT_PUBLIC_SUPABASE_URL.ok,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The mail configuration (§1.2, blocking).
//
// lib/email.ts is best-effort and never throws into the booking write path,
// which is correct — but the cost is that a misconfigured mailer is completely
// silent. These checks are the only place that silence gets broken, so each is
// pinned to the specific mistake it exists to catch.
// ---------------------------------------------------------------------------
describe('the mail transport', () => {
  it('says plainly that no transport at all means no email at all', () => {
    const check = checkEnvironment(base).MAIL_TRANSPORT;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/NO email/i);
    // Names both ways out, since the whole point is that the reader is stuck.
    expect(check.detail).toMatch(/GMAIL_USER/);
    expect(check.detail).toMatch(/RESEND_API_KEY/);
  });

  it('infers gmail from the credentials being present', () => {
    const result = checkEnvironment(good);
    expect(result.MAIL_TRANSPORT.detail).toMatch(/gmail/);
    expect(result.GMAIL_USER).toBeDefined();
  });

  it('infers resend from the credentials being present', () => {
    const result = checkEnvironment(goodResend);
    expect(result.MAIL_TRANSPORT.detail).toMatch(/resend/);
    expect(result.RESEND_API_KEY).toBeDefined();
  });

  // Reporting Resend's variables on a Gmail deployment would be noise, and a
  // missing RESEND_API_KEY there would be a false alarm.
  it('reports only the variables the selected transport actually uses', () => {
    const gmail = checkEnvironment(good);
    expect(gmail.RESEND_API_KEY).toBeUndefined();
    expect(gmail.BOOKING_FROM_EMAIL).toBeUndefined();

    const resend = checkEnvironment(goodResend);
    expect(resend.GMAIL_USER).toBeUndefined();
    expect(resend.GMAIL_APP_PASSWORD).toBeUndefined();
  });

  it('lets MAIL_TRANSPORT force the choice when both are configured', () => {
    const both = { ...good, ...goodResend };
    // Inference alone would pick gmail; the explicit setting must win, so a
    // migration to Resend is one variable rather than deleting credentials.
    const forced = checkEnvironment({ ...both, MAIL_TRANSPORT: 'resend' });
    expect(forced.RESEND_API_KEY).toBeDefined();
    expect(forced.GMAIL_USER).toBeUndefined();
  });
});

describe('the Gmail credentials', () => {
  it('catches the account password being pasted instead of an App Password', () => {
    const check = checkEnvironment({ ...good, GMAIL_APP_PASSWORD: 'my-real-password!' })
      .GMAIL_APP_PASSWORD;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/16 characters/);
  });

  it('accepts the spaced form Google displays', () => {
    // Google shows it as four groups of four; people paste it exactly so.
    expect(
      checkEnvironment({ ...good, GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }).GMAIL_APP_PASSWORD.ok,
    ).toBe(true);
    expect(
      checkEnvironment({ ...good, GMAIL_APP_PASSWORD: 'abcdefghijklmnop' }).GMAIL_APP_PASSWORD.ok,
    ).toBe(true);
  });

  it('rejects a sender that is not an address', () => {
    expect(checkEnvironment({ ...good, GMAIL_USER: 'Grace Nails' }).GMAIL_USER.ok).toBe(false);
  });

  it('tells the reader where App Passwords come from', () => {
    const check = checkEnvironment({ ...good, GMAIL_APP_PASSWORD: undefined, MAIL_TRANSPORT: 'gmail' })
      .GMAIL_APP_PASSWORD;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/2-Step Verification/i);
  });
});

describe('the Resend credentials', () => {
  it('rejects a key that is not a Resend key', () => {
    const check = checkEnvironment({ ...goodResend, RESEND_API_KEY: 'SG.sendgrid_key' })
      .RESEND_API_KEY;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/re_/);
  });

  // The trap: a valid key plus no sender is the configuration that looks done
  // and delivers nothing, because the fallback domain cannot be verified.
  it('catches a missing sender, which fails every send despite a valid key', () => {
    const check = checkEnvironment({ ...goodResend, BOOKING_FROM_EMAIL: undefined })
      .BOOKING_FROM_EMAIL;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/example\.com/);
    expect(check.detail).toMatch(/every send fails/i);
  });

  it('catches the example address being set explicitly', () => {
    expect(
      checkEnvironment({ ...goodResend, BOOKING_FROM_EMAIL: 'bookings@example.com' })
        .BOOKING_FROM_EMAIL.ok,
    ).toBe(false);
  });

  it('rejects the resend.dev test sender, which never reaches a customer', () => {
    const check = checkEnvironment({ ...goodResend, BOOKING_FROM_EMAIL: 'onboarding@resend.dev' })
      .BOOKING_FROM_EMAIL;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/only delivers to your own account/i);
  });

  it('accepts the "Name <addr>" form Resend also takes', () => {
    expect(
      checkEnvironment({
        ...goodResend,
        BOOKING_FROM_EMAIL: 'Grace Nails <bookings@gracenails.co.za>',
      }).BOOKING_FROM_EMAIL.ok,
    ).toBe(true);
  });
});

describe('the owner address', () => {
  it('notes that a missing one leaves her uninformed, not the customer', () => {
    const check = checkEnvironment({ ...good, OWNER_NOTIFICATION_EMAIL: undefined })
      .OWNER_NOTIFICATION_EMAIL;
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/owner is not told/i);
  });

  it('is required whichever transport is in use', () => {
    expect(
      checkEnvironment({ ...goodResend, OWNER_NOTIFICATION_EMAIL: undefined })
        .OWNER_NOTIFICATION_EMAIL.ok,
    ).toBe(false);
  });
});

/**
 * The assistant's configuration — spec §57.
 *
 * Reported apart from `checkEnvironment` on purpose, and these tests are the
 * reason: an AI entry inside it would turn the health check of a perfectly
 * working AI-less deployment red, which trains whoever is on call to ignore
 * the one endpoint they are supposed to trust.
 */
describe('the AI configuration', () => {
  const configured = {
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'AIzaNotARealKey',
    AI_MODEL: 'a-model',
  };

  it('calls a deployment with no AI healthy, because it is', () => {
    const check = checkAi({});
    expect(check.ok).toBe(true);
    expect(check.configured).toBe(false);
    expect(check.detail).toMatch(/rest of the site is unaffected/i);
  });

  it('reports the provider and that a model is set, never the values', () => {
    const check = checkAi(configured);
    expect(check).toMatchObject({ ok: true, configured: true, provider: 'gemini', modelConfigured: true });
    expect(JSON.stringify(check)).not.toContain('a-model');
    expect(JSON.stringify(check)).not.toContain('AIzaNotARealKey');
  });

  it('goes red on a half-configured deployment', () => {
    // Half-configured is the state that produces an assistant which is present,
    // looks configured, and fails every single request.
    expect(checkAi({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'AIzaNotARealKey' })).toMatchObject({
      ok: false,
      configured: false,
      modelConfigured: false,
    });
    expect(checkAi({ AI_PROVIDER: 'gemini', AI_MODEL: 'a-model' }).ok).toBe(false);
  });

  it('goes red on a key in a NEXT_PUBLIC_ variable', () => {
    // A security incident, not a nit: NEXT_PUBLIC_ inlines it into the browser
    // bundle, so it is a key every visitor can read and spend.
    const check = checkAi({ ...configured, NEXT_PUBLIC_GEMINI_API_KEY: 'leaked' });
    expect(check.ok).toBe(false);
    expect(check.detail).toMatch(/NEXT_PUBLIC_GEMINI_API_KEY/);
    expect(check.detail).toMatch(/rotate/i);
  });
});

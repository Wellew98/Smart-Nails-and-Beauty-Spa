/**
 * Configuration checks behind GET /api/health.
 *
 * Kept out of the route file so it can be unit tested. Testing it through the
 * route is not possible in any useful way: NEXT_PUBLIC_* values are inlined at
 * build time, so overriding them at runtime does nothing and a test would
 * silently assert against whatever was baked in. As a plain function reading
 * process.env, it is testable.
 *
 * Never returns the VALUE of anything — only whether a name is set and what is
 * wrong with it. GET /api/health has to be open, because the auth it would
 * otherwise use is one of the things that might be broken.
 */

import { providerConfigProblem, selectedProvider } from './ai/provider';
import { bareAddress, selectedTransport } from './mail';

export interface Check {
  ok: boolean;
  detail: string;
}

/** Just the shape this reads. NodeJS.ProcessEnv demands NODE_ENV, which is noise here. */
export type EnvLike = Record<string, string | undefined>;

/**
 * Keys are not a fixed set: which email variables are reported depends on
 * which mail transport the deployment selected. Reporting Resend's variables
 * on a Gmail deployment would be four lines of noise and one false alarm.
 */
export function checkEnvironment(env: EnvLike = process.env): Record<string, Check> {
  const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const dbUrl = env.SUPABASE_DB_URL;
  const siteUrl = env.NEXT_PUBLIC_SITE_URL;

  return {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl
      ? /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(supabaseUrl)
        ? { ok: true, detail: 'set, and shaped like a project URL' }
        : { ok: false, detail: 'set, but not shaped like https://<ref>.supabase.co' }
      : { ok: false, detail: 'missing — the admin cannot sign anyone in' },

    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: checkPublishableKey(publishable),

    SUPABASE_DB_URL: checkDatabaseUrl(dbUrl),

    NEXT_PUBLIC_SITE_URL: siteUrl
      ? /localhost|127\.0\.0\.1/.test(siteUrl)
        ? { ok: false, detail: 'still points at localhost — booking confirmation links would go nowhere' }
        : { ok: true, detail: 'set' }
      : { ok: false, detail: 'missing — confirmation links and JSON-LD need an absolute URL' },

    ...emailChecks(env),
  };
}

export interface AiCheck extends Check {
  configured: boolean;
  provider: string | null;
  modelConfigured: boolean;
}

/**
 * The assistant's configuration — spec §57.
 *
 * ---------------------------------------------------------------------------
 * REPORTED SEPARATELY FROM `environment`, AND DELIBERATELY SO.
 *
 * Every entry in `checkEnvironment()` is something a working deployment must
 * have, and the endpoint returns 503 if any of them is false. The assistant is
 * not in that category: it is an enhancement, `/book` does not depend on it,
 * and a deployment with no AI configured is a perfectly healthy deployment. An
 * AI entry in `environment` would 503 the health check of a site that is
 * completely fine, which trains whoever is on call to ignore it.
 *
 * So `ok` here means NOT MISCONFIGURED, which is true both when the assistant
 * is fully set up and when it is entirely absent. It is false only for the
 * states that are actually wrong: half-configured, or a key pasted into a
 * NEXT_PUBLIC_ variable — which is a security incident, not a nit, and should
 * absolutely turn this endpoint red.
 *
 * Never returns the key, the model name, or any value.
 * ---------------------------------------------------------------------------
 */
export function checkAi(env: EnvLike = process.env): AiCheck {
  const provider = selectedProvider(env);
  const problem = providerConfigProblem(env);

  // Nothing set at all. The normal state before the AI variables are added.
  if (!provider && !env.AI_MODEL && !env.GEMINI_API_KEY) {
    return {
      ok: true,
      configured: false,
      provider: null,
      modelConfigured: false,
      detail: 'no AI configured — the assistant is switched off and the rest of the site is unaffected',
    };
  }

  if (problem) {
    return {
      ok: false,
      configured: false,
      provider,
      modelConfigured: Boolean(env.AI_MODEL?.trim()),
      detail: problem,
    };
  }

  return {
    ok: true,
    configured: true,
    provider,
    modelConfigured: true,
    detail: `${provider} configured, with a model set`,
  };
}

/**
 * The mail configuration — spec §1.2, which calls this blocking.
 *
 * WHY THIS IS CHECKED AT ALL. `lib/email.ts` is best-effort and never throws
 * into the booking write path, which is correct: a booking safely in the
 * database must not be reported as a failure because a provider had a bad
 * minute, or the customer would rebook and the spa would have two
 * appointments. The cost of that correct decision is that a misconfigured
 * mailer is *completely silent*. The customer books, receives nothing, and
 * phones to check — which §1.2 rightly calls worse than having no system.
 *
 * So this endpoint is the only place that silence gets broken, and §16's
 * "GET /api/health first, always" is the habit it relies on.
 */
function emailChecks(env: EnvLike): Record<string, Check> {
  const transport = selectedTransport(env);
  const owner = { OWNER_NOTIFICATION_EMAIL: checkOwnerEmail(env.OWNER_NOTIFICATION_EMAIL) };

  if (transport === 'gmail') {
    return {
      MAIL_TRANSPORT: { ok: true, detail: 'gmail — sending over SMTP as the Gmail account below' },
      GMAIL_USER: checkGmailUser(env.GMAIL_USER),
      GMAIL_APP_PASSWORD: checkGmailAppPassword(env.GMAIL_APP_PASSWORD),
      ...owner,
    };
  }

  if (transport === 'resend') {
    return {
      MAIL_TRANSPORT: { ok: true, detail: 'resend — sending over the Resend API' },
      RESEND_API_KEY: checkResendKey(env.RESEND_API_KEY),
      BOOKING_FROM_EMAIL: checkFromEmail(env.BOOKING_FROM_EMAIL),
      ...owner,
    };
  }

  return {
    MAIL_TRANSPORT: {
      ok: false,
      detail:
        'no mail transport configured — NO email is sent at all. Bookings still save, and ' +
        'neither the customer nor the owner is told. Set GMAIL_USER + GMAIL_APP_PASSWORD ' +
        '(free, no domain needed), or RESEND_API_KEY + BOOKING_FROM_EMAIL (needs a verified ' +
        'domain).',
    },
    ...owner,
  };
}

function checkGmailUser(user: string | undefined): Check {
  if (!user) return { ok: false, detail: 'missing — the Gmail address to send from' };
  if (!looksLikeEmail(bareAddress(user))) {
    return { ok: false, detail: 'set, but is not an email address' };
  }
  return { ok: true, detail: 'set, and shaped like an address' };
}

function checkGmailAppPassword(password: string | undefined): Check {
  if (!password) {
    return {
      ok: false,
      detail:
        'missing — generate one at Google Account > Security > App passwords. Requires 2-Step ' +
        'Verification on the account.',
    };
  }

  // Google issues these as 16 characters, shown in four groups of four. An
  // account password pasted here instead is the common mistake, and Gmail
  // rejects it with a generic auth failure that says nothing useful.
  const stripped = password.replace(/\s+/g, '');
  if (stripped.length !== 16) {
    return {
      ok: false,
      detail:
        'set, but a Google App Password is 16 characters. This looks like the account password, ' +
        'which SMTP will reject.',
    };
  }
  return { ok: true, detail: 'set, and shaped like a Google App Password' };
}

function checkResendKey(key: string | undefined): Check {
  if (!key) {
    return {
      ok: false,
      detail:
        'missing — NO email is sent at all. Bookings still save, and neither the customer nor ' +
        'the owner is told. Resend > API Keys.',
    };
  }
  if (!key.startsWith('re_')) {
    return { ok: false, detail: 'set, but a Resend API key starts with re_' };
  }
  return { ok: true, detail: 'set, and shaped like a Resend API key' };
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function checkFromEmail(value: string | undefined): Check {
  // The trap this check exists for. lib/email.ts falls back to
  // bookings@example.com, which is a domain nobody can verify, so Resend
  // rejects EVERY send with a 403 — while the key itself is perfectly valid.
  // Set the key and forget this one and the system looks configured and
  // delivers nothing.
  if (!value) {
    return {
      ok: false,
      detail:
        'missing — the fallback sender is bookings@example.com, which Resend refuses, so every ' +
        'send fails even with a valid API key. Must be an address on a domain verified in Resend.',
    };
  }

  const address = bareAddress(value);
  if (!looksLikeEmail(address)) {
    return { ok: false, detail: 'set, but is not an email address' };
  }
  if (/@example\.(com|org|net)$/i.test(address)) {
    return { ok: false, detail: 'still the example address — Resend will refuse every send' };
  }
  // Resend's shared test sender only delivers to the account holder's own
  // address. Fine for a smoke test, useless to a customer.
  if (/@resend\.dev$/i.test(address)) {
    return {
      ok: false,
      detail:
        'this is Resend\'s test sender. It only delivers to your own account address, so real ' +
        'customers receive nothing. Verify the spa\'s domain and send from that.',
    };
  }
  return { ok: true, detail: 'set, and shaped like an address on a real domain' };
}

function checkOwnerEmail(value: string | undefined): Check {
  if (!value) {
    return {
      ok: false,
      detail:
        'missing — the owner is not told about new bookings or cancellations. Customers are ' +
        'still emailed; she is not.',
    };
  }
  return looksLikeEmail(bareAddress(value))
    ? { ok: true, detail: 'set' }
    : { ok: false, detail: 'set, but is not an email address' };
}

function checkPublishableKey(key: string | undefined): Check {
  if (!key) return { ok: false, detail: 'missing — the admin cannot sign anyone in' };

  // Checked FIRST. A secret key here is not a configuration nit: NEXT_PUBLIC_
  // ships it to every visitor, and it bypasses every row-level security policy,
  // so anyone reading the page source could read and edit the whole database.
  if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
    return {
      ok: false,
      detail:
        'THIS IS A SECRET KEY. It bypasses row-level security and NEXT_PUBLIC_ sends it to every ' +
        'visitor. Replace it with the publishable key and rotate this one in Supabase immediately.',
    };
  }

  // A service-role JWT is also a secret, and looks like any other JWT from the
  // outside. Decode the payload and check the role claim rather than guessing.
  if (key.startsWith('eyJ')) {
    const role = jwtRole(key);
    if (role === 'service_role') {
      return {
        ok: false,
        detail:
          'THIS IS A SERVICE-ROLE KEY. It bypasses row-level security and NEXT_PUBLIC_ sends it ' +
          'to every visitor. Replace it with the anon key and rotate this one immediately.',
      };
    }
    return { ok: true, detail: 'set, and shaped like an anon key' };
  }

  if (key.startsWith('sb_publishable_')) {
    return { ok: true, detail: 'set, and shaped like a publishable key' };
  }

  return { ok: false, detail: 'set, but does not look like a publishable or anon key' };
}

/** Best-effort read of a JWT's `role` claim. Returns null if it is not a JWT. */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

function checkDatabaseUrl(url: string | undefined): Check {
  if (!url) return { ok: false, detail: 'missing — no page that reads data can render' };

  if (/\[YOUR-PASSWORD\]|\[YOUR_PASSWORD\]|<password>/i.test(url)) {
    return { ok: false, detail: 'the password placeholder was never replaced with the real database password' };
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    return { ok: false, detail: 'set, but is not a postgres:// URL' };
  }

  if (/db\.[a-z0-9]+\.supabase\.co/i.test(url)) {
    return {
      ok: false,
      detail:
        'this is the DIRECT connection string, which is IPv6-only. Use the Transaction pooler ' +
        'string (Supabase > Connect, port 6543) instead.',
    };
  }

  return { ok: true, detail: 'set, and shaped like a pooled connection string' };
}

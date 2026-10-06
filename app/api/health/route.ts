import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/ai/provider';
import { getPool } from '@/lib/db';
import { checkAi, checkEnvironment, type Check } from '@/lib/health';
import { getTransport } from '@/lib/mail';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — is this deployment wired up correctly?
 *
 * Reading a hosting platform's runtime logs on a phone, while the site is down,
 * is a miserable way to find out that one environment variable is wrong. This
 * answers the same question in a browser tab.
 *
 * Returns no value of any variable, no database host or username, and no raw
 * driver error — only whether each name is set, and a category for what went
 * wrong. That keeps it safe to open without auth, which it must be, since the
 * auth it would use is one of the things that might be broken.
 */

async function databaseCheck(): Promise<Check & { businessName?: string; treatments?: number }> {
  try {
    const result = await getPool().query(
      `select (select name from businesses limit 1) as name,
              (select count(*)::int from services where active) as treatments`,
    );
    const row = result.rows[0];
    if (!row?.name) {
      return { ok: false, detail: 'connected, but there is no business row — migrations may not have run' };
    }
    return { ok: true, detail: 'connected', businessName: row.name, treatments: row.treatments };
  } catch (error) {
    // lib/db.ts already turns connection failures into plain English. Anything
    // else is reported by class only, never verbatim.
    const message = error instanceof Error ? error.message : String(error);
    const known = /IPv6-only|PAUSED|Password rejected|not set|Could not resolve|Timed out/i.test(message);
    return { ok: false, detail: known ? message.split('\n')[0] : 'could not query the database' };
  }
}

/**
 * Does the mail provider actually accept these credentials?
 *
 * OPT-IN, via `?verify=mail`, for two reasons. It costs an SMTP round trip,
 * and this endpoint is the thing you open when the site is down — it should
 * stay fast. And a Gmail account with an aggressive security posture may treat
 * repeated authentication attempts as worth an alert, which is not something
 * to trigger on every health poll.
 *
 * Worth having at all because the default checks are shape-only: they will
 * happily confirm an App Password is 16 characters while Gmail rejects those
 * particular 16. Since `lib/email.ts` never throws into the write path, the
 * first symptom of that would be an email that silently never arrives — the
 * exact failure §1.2 calls worse than having no system.
 */
async function mailCheck(): Promise<Check> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, detail: 'no mail transport configured — nothing to verify' };
  }
  if (!transport.verify) {
    return {
      ok: true,
      detail: `${transport.name} offers no credential check that does not send a message — not verified`,
    };
  }
  try {
    return await transport.verify();
  } catch (error) {
    // verify() is meant to return rather than throw; if it throws anyway, that
    // must not take down the one endpoint used to diagnose everything else.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `could not check the mail credentials: ${message}` };
  }
}

/**
 * Does the AI provider actually answer?
 *
 * OPT-IN via `?verify=ai`, for the same two reasons as `?verify=mail`: it costs
 * a network round trip on the endpoint you open when the site is down, and it
 * spends a request from a rate-limited free tier. Kept as small as a request
 * can be — a one-word prompt and a handful of output tokens — because the
 * question is "does this key reach a model that exists", not "is the assistant
 * any good".
 *
 * Worth having because the default check is shape-only: it confirms a key and a
 * model name are set, and cannot tell that the key was revoked or that
 * AI_MODEL names a model that was deprecated last month. Both of those surface
 * to customers as the assistant being permanently unavailable, and to a log
 * reader as nothing at all.
 */
async function aiCheck(): Promise<Check> {
  const provider = getProvider();
  if (!provider) {
    return { ok: false, detail: 'no AI provider configured — nothing to verify' };
  }
  try {
    const result = await provider.generateResponse({
      systemPrompt: 'Reply with the single word: ok',
      messages: [{ role: 'user', content: 'ok' }],
      maxOutputTokens: 8,
      timeoutMs: 10_000,
    });
    return result.ok
      ? { ok: true, detail: `${provider.name} answered` }
      : { ok: false, detail: `${provider.name}: ${result.failure} — ${result.detail}` };
  } catch (error) {
    // Meant to return rather than throw. If it throws anyway, that must not
    // take down the endpoint used to diagnose everything else.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, detail: `could not reach the AI provider: ${message}` };
  }
}

export async function GET(request: Request) {
  const verify = new URL(request.url).searchParams.get('verify');
  const verifyMail = verify === 'mail';
  const verifyAi = verify === 'ai';

  const environment = checkEnvironment();
  const ai = checkAi();
  const [database, mail, aiVerified] = await Promise.all([
    databaseCheck(),
    verifyMail ? mailCheck() : Promise.resolve(null),
    verifyAi ? aiCheck() : Promise.resolve(null),
  ]);

  const ok =
    Object.values(environment).every((c) => c.ok) &&
    database.ok &&
    // Not misconfigured. An absent assistant is a healthy deployment; a key in
    // a NEXT_PUBLIC_ variable is not. See checkAi().
    ai.ok &&
    (mail ? mail.ok : true) &&
    (aiVerified ? aiVerified.ok : true);

  return NextResponse.json(
    {
      ok,
      summary: ok ? 'Everything is wired up.' : 'Something is not configured. See the entries marked ok: false.',
      environment,
      database,
      ai,
      ...(mail ? { mail } : {}),
      ...(aiVerified ? { aiVerification: aiVerified } : {}),
      hint: 'NEXT_PUBLIC_* values are baked in at build time. After changing them, redeploy.',
      ...(verifyMail || verifyAi
        ? {}
        : {
            tip: 'Add ?verify=mail to ask the mail provider whether the credentials work, or ?verify=ai to ask the AI provider.',
          }),
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

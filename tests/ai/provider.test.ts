import { describe, expect, it } from 'vitest';
import { GeminiProvider } from '@/lib/ai/gemini';
import {
  MAX_TIMEOUT_MS,
  getProvider,
  providerConfigProblem,
  resolveTimeoutMs,
  selectedProvider,
} from '@/lib/ai/provider';
import { REDACTED_EMAIL, REDACTED_PHONE } from '@/lib/ai/validation';
import type { AIToolDeclaration } from '@/lib/ai/types';

/**
 * The provider seam (`lib/ai/provider.ts`, `lib/ai/gemini.ts`).
 *
 * No network. Every one of these drives a stub `fetch`, because the point of
 * the exercise is the failure modes — a rejected key, a rate limit, a provider
 * having a bad afternoon — and those are precisely the ones a real call will
 * not reproduce on demand.
 *
 * The property under all of them: a provider failure is a VALUE the caller can
 * read, never an exception, and never a retry. The assistant is a convenience
 * on top of a booking system that works without it, and it has to fail like
 * one.
 */

const env = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key', AI_MODEL: 'a-model' };

interface Call {
  url: string;
  init: RequestInit;
}

/** A `fetch` that answers with `body` and records what it was asked. */
function stubFetch(status: number, body: unknown, calls: Call[] = []) {
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function provider(fetchImpl: typeof fetch, overrides: Partial<{ timeoutMs: number }> = {}) {
  return new GeminiProvider({ apiKey: 'test-key', model: 'a-model', fetchImpl, ...overrides });
}

const ask = { systemPrompt: 'be helpful', messages: [{ role: 'user' as const, content: 'hello' }] };

function textResponse(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('choosing a provider', () => {
  it('takes the provider from the environment, or infers it from the key', () => {
    expect(selectedProvider(env)).toBe('gemini');
    expect(selectedProvider({ GEMINI_API_KEY: 'k' })).toBe('gemini');
    expect(selectedProvider({})).toBeNull();
  });

  it('ignores an AI_PROVIDER naming something that does not exist', () => {
    expect(selectedProvider({ ...env, AI_PROVIDER: 'openai' })).toBe('gemini');
  });
});

describe('reporting why the assistant is off', () => {
  it('says nothing is configured when nothing is', () => {
    expect(providerConfigProblem({})).toMatch(/AI_PROVIDER/);
  });

  it('names the missing key and the missing model separately', () => {
    expect(providerConfigProblem({ AI_PROVIDER: 'gemini', AI_MODEL: 'a-model' })).toMatch(
      /GEMINI_API_KEY/,
    );
    expect(providerConfigProblem({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toMatch(/AI_MODEL/);
    expect(providerConfigProblem({ ...env, AI_MODEL: '   ' })).toMatch(/AI_MODEL/);
  });

  it('refuses a key pasted into a NEXT_PUBLIC_ variable', () => {
    // The mistake /api/health already guards against for Supabase. NEXT_PUBLIC_
    // is inlined into the browser bundle, so this is a key every visitor can
    // read and spend.
    const problem = providerConfigProblem({ ...env, NEXT_PUBLIC_GEMINI_API_KEY: 'leaked' });
    expect(problem).toMatch(/NEXT_PUBLIC_GEMINI_API_KEY/);
    expect(problem).toMatch(/rotate/i);
    expect(getProvider({ ...env, NEXT_PUBLIC_GEMINI_API_KEY: 'leaked' })).toBeNull();
  });

  it('says nothing when the configuration is complete', () => {
    expect(providerConfigProblem(env)).toBeNull();
  });
});

describe('building a provider', () => {
  it('returns null rather than throwing when there is no key', () => {
    // A deployment with no AI configured is a normal state, not an error. The
    // caller reads null as "no assistant" exactly as lib/email.ts reads a null
    // transport as "no mailer".
    expect(getProvider({ AI_PROVIDER: 'gemini', AI_MODEL: 'a-model' })).toBeNull();
    expect(getProvider({})).toBeNull();
  });

  it('takes the model name from the environment and never defaults one', () => {
    expect(getProvider(env)?.model).toBe('a-model');
    expect(getProvider({ ...env, AI_MODEL: 'another-model' })?.model).toBe('another-model');
    // No AI_MODEL means no provider — deliberately. A model name baked into the
    // code outlives its own deprecation, and the first symptom would be a 404
    // from the provider months later.
    expect(getProvider({ ...env, AI_MODEL: undefined })).toBeNull();
  });

  it('offers tool calling', () => {
    expect(getProvider(env)?.supportsToolCalling()).toBe(true);
  });
});

describe('the timeout bound', () => {
  it('cannot be removed by an environment variable', () => {
    expect(resolveTimeoutMs(undefined, undefined)).toBeGreaterThan(0);
    expect(resolveTimeoutMs(undefined, Number('not-a-number'))).toBeGreaterThan(0);
    expect(resolveTimeoutMs(undefined, 0)).toBeGreaterThan(0);
    expect(resolveTimeoutMs(undefined, -1)).toBeGreaterThan(0);
    expect(resolveTimeoutMs(undefined, 10_000_000)).toBe(MAX_TIMEOUT_MS);
    expect(resolveTimeoutMs(10_000_000, 1_000)).toBe(MAX_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// The happy path, and what leaves this process
// ---------------------------------------------------------------------------

describe('generating a response', () => {
  it('returns the text the provider produced', async () => {
    const { impl } = stubFetch(200, textResponse('We are open all week.'));
    const result = await provider(impl).generateResponse(ask);

    expect(result).toEqual({ ok: true, value: { text: 'We are open all week.' } });
  });

  it('sends the key in a header and never in the URL', async () => {
    // Anything in a URL ends up in proxy logs, error messages and stack traces.
    const { impl, calls } = stubFetch(200, textResponse('hi'));
    await provider(impl).generateResponse(ask);

    expect(calls[0].url).not.toContain('test-key');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(String(calls[0].init.body)).not.toContain('test-key');
  });

  it('puts the configured model in the URL, so a wrong one is diagnosable', async () => {
    const { impl, calls } = stubFetch(200, textResponse('hi'));
    await provider(impl).generateResponse(ask);
    expect(calls[0].url).toContain('a-model');
  });

  it('strips phone numbers and email addresses out of what it sends', async () => {
    // The prompt tells the assistant not to take these in conversation and the
    // client is meant to capture them in a form. Both are instructions, and
    // instructions get forgotten. This is the gate that does not.
    const { impl, calls } = stubFetch(200, textResponse('ok'));
    await provider(impl).generateResponse({
      ...ask,
      messages: [
        { role: 'user', content: "I'm on 082 555 0101, or thandi@example.co.za" },
        { role: 'user', content: 'and +27 63 352 5374' },
      ],
    });

    const body = String(calls[0].init.body);
    expect(body).not.toContain('082 555 0101');
    expect(body).not.toContain('thandi@example.co.za');
    expect(body).not.toContain('63 352 5374');
    expect(body).toContain(REDACTED_PHONE);
    expect(body).toContain(REDACTED_EMAIL);
  });

  it("does not strip the studio's own phone number out of a tool result", async () => {
    // The number get_business_info returns is public, is on the footer of every
    // page, and is the answer to "how do I reach you?". A blanket sweep over
    // every turn would delete it and nothing would throw — the assistant would
    // simply become unable to give out the number the site advertises.
    const { impl, calls } = stubFetch(200, textResponse('ok'));
    await provider(impl).generateResponse({
      ...ask,
      messages: [
        { role: 'user', content: 'how do I reach you?' },
        { role: 'assistant', content: '{"phone":"081 044 4429","name":"Smart Nails and Beauty Spa"}' },
        { role: 'user', content: 'thanks' },
      ],
    });

    expect(String(calls[0].init.body)).toContain('081 044 4429');
  });

  it('still strips a number the customer wrote, in the same conversation', async () => {
    // The scoping must not be a way of switching redaction off. A customer's
    // details can only arrive in a turn the customer wrote, and that turn is
    // exactly the one still being cleaned.
    const { impl, calls } = stubFetch(200, textResponse('ok'));
    await provider(impl).generateResponse({
      ...ask,
      messages: [
        { role: 'assistant', content: 'We are on 081 044 4429.' },
        { role: 'user', content: 'Mine is 082 555 0101' },
      ],
    });

    const body = String(calls[0].init.body);
    expect(body).toContain('081 044 4429');
    expect(body).not.toContain('082 555 0101');
    expect(body).toContain(REDACTED_PHONE);
  });

  it('leaves times, prices, dates and durations alone', async () => {
    const { impl, calls } = stubFetch(200, textResponse('ok'));
    await provider(impl).generateResponse({
      ...ask,
      messages: [{ role: 'user', content: 'R320 at 10:00 on 2026-08-11, 45 min?' }],
    });

    const body = String(calls[0].init.body);
    expect(body).toContain('R320');
    expect(body).toContain('10:00');
    expect(body).toContain('2026-08-11');
    expect(body).toContain('45 min');
  });
});

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

describe('when the key is missing', () => {
  it('fails as not_configured instead of calling the provider', async () => {
    const { impl, calls } = stubFetch(200, textResponse('hi'));
    const result = await new GeminiProvider({ apiKey: '', model: 'a-model', fetchImpl: impl })
      .generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'not_configured', retryable: false });
    expect(calls).toHaveLength(0);
  });
});

describe('when the key is invalid', () => {
  it('reads the 400 the provider actually sends for a bad key', async () => {
    // Gemini answers a rejected key with 400 INVALID_ARGUMENT / API_KEY_INVALID,
    // not a 401. Reported as unauthorised anyway: the fix is a person's, and
    // the caller must not be encouraged to try again.
    const { impl } = stubFetch(400, {
      error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' },
    });
    const result = await provider(impl).generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'unauthorised', retryable: false });
    expect((result as { detail: string }).detail).not.toContain('test-key');
  });

  it('treats 401 and 403 the same way', async () => {
    for (const status of [401, 403]) {
      const { impl } = stubFetch(status, { error: { status: 'PERMISSION_DENIED' } });
      expect(await provider(impl).generateResponse(ask)).toMatchObject({
        ok: false,
        failure: 'unauthorised',
      });
    }
  });
});

describe('when the model name is wrong', () => {
  it('says so, and points at AI_MODEL', async () => {
    const { impl } = stubFetch(404, { error: { status: 'NOT_FOUND', message: 'model not found' } });
    const result = await provider(impl).generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'bad_request' });
    expect((result as { detail: string }).detail).toMatch(/AI_MODEL/);
  });
});

describe('when the provider rate limits', () => {
  it('reports it as retryable and does not retry', async () => {
    const { impl, calls } = stubFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    const result = await provider(impl).generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'rate_limited', retryable: true });
    // The whole point: a retry inside the provider multiplies every visitor's
    // request into several during exactly the outage that caused the limit.
    expect(calls).toHaveLength(1);
  });
});

describe('when the provider is unavailable', () => {
  it('reports a 5xx as retryable, once', async () => {
    const { impl, calls } = stubFetch(503, { error: { status: 'UNAVAILABLE' } });
    const result = await provider(impl).generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'unavailable', retryable: true });
    expect(calls).toHaveLength(1);
  });

  it('reports a network failure without throwing', async () => {
    const impl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }) as unknown as typeof fetch;

    const result = await provider(impl).generateResponse(ask);
    expect(result).toMatchObject({ ok: false, failure: 'unavailable', retryable: true });
    expect((result as { detail: string }).detail).toContain('ENOTFOUND');
  });

  it('reports an HTML error page from something in front of the provider', async () => {
    const impl = (async () =>
      new Response('<html>502 Bad Gateway</html>', { status: 502 })) as unknown as typeof fetch;

    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'unavailable',
      retryable: true,
    });
  });
});

/** A provider that never answers, and only ever settles when it is aborted. */
const stalls = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (init.signal?.aborted) return abort();
    init.signal?.addEventListener('abort', abort);
  })) as unknown as typeof fetch;

describe('when the provider does not answer', () => {
  it('gives up at the bound rather than holding the request open', async () => {
    // nodemailer's two-minute default cost this project a serverless function
    // held open for two minutes to send an email that was never going to
    // arrive (lib/mail.ts). Same mistake, different provider.
    const started = Date.now();
    const result = await provider(stalls, { timeoutMs: 50 }).generateResponse(ask);

    expect(result).toMatchObject({ ok: false, failure: 'timeout', retryable: true });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('does not report the caller cancelling as a provider timeout', async () => {
    const result = await provider(stalls).generateResponse({ ...ask, signal: AbortSignal.abort() });
    expect(result).toMatchObject({ ok: false, failure: 'unavailable' });
    expect((result as { detail: string }).detail).toMatch(/cancelled/);
  });
});

describe('when the response is malformed', () => {
  it('rejects a 200 with no candidates', async () => {
    const { impl } = stubFetch(200, {});
    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'malformed_response',
    });
  });

  it('rejects a candidate with no parts', async () => {
    const { impl } = stubFetch(200, { candidates: [{ content: {} }] });
    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'malformed_response',
    });
  });

  it('rejects an empty answer rather than passing silence on', async () => {
    const { impl } = stubFetch(200, textResponse('   '));
    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'malformed_response',
    });
  });

  it('rejects a 200 whose body is not JSON', async () => {
    const impl = (async () =>
      new Response('not json at all', { status: 200 })) as unknown as typeof fetch;

    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'malformed_response',
    });
  });
});

describe("when the provider's safety filter fires", () => {
  it('reports a blocked prompt', async () => {
    const { impl } = stubFetch(200, { promptFeedback: { blockReason: 'SAFETY' } });
    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'blocked',
    });
  });

  it('reports a stopped answer', async () => {
    const { impl } = stubFetch(200, { candidates: [{ finishReason: 'SAFETY', content: {} }] });
    expect(await provider(impl).generateResponse(ask)).toMatchObject({
      ok: false,
      failure: 'blocked',
    });
  });
});

// ---------------------------------------------------------------------------
// Tool calling
// ---------------------------------------------------------------------------

const tools: AIToolDeclaration[] = [
  {
    name: 'get_services',
    description: 'the treatments',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

describe('asking for a tool call', () => {
  it('returns the call the model chose', async () => {
    const { impl, calls } = stubFetch(200, {
      candidates: [
        { content: { parts: [{ functionCall: { name: 'get_services', args: {} } }] } },
      ],
    });

    const result = await provider(impl).generateToolCall({ ...ask, tools });

    expect(result).toMatchObject({ ok: true, value: { toolCall: { name: 'get_services' } } });
    expect(String(calls[0].init.body)).toContain('functionDeclarations');
  });

  it('returns prose with no call when the model just answered', async () => {
    const { impl } = stubFetch(200, textResponse('Happy to help.'));
    const result = await provider(impl).generateToolCall({ ...ask, tools });

    expect(result).toMatchObject({ ok: true, value: { text: 'Happy to help.', toolCall: null } });
  });

  it('hands back arguments untouched, for validation to reject', async () => {
    // The provider does not validate. Deciding what a well-formed argument is
    // belongs in one place (validation.ts), not two.
    const { impl } = stubFetch(200, {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'check_availability', args: { date: 'nonsense' } } }],
          },
        },
      ],
    });

    const result = await provider(impl).generateToolCall({ ...ask, tools });
    expect(result).toMatchObject({
      ok: true,
      value: { toolCall: { name: 'check_availability', args: { date: 'nonsense' } } },
    });
  });

  it('rejects a turn that is neither prose nor a call', async () => {
    const { impl } = stubFetch(200, { candidates: [{ content: { parts: [] } }] });
    expect(await provider(impl).generateToolCall({ ...ask, tools })).toMatchObject({
      ok: false,
      failure: 'malformed_response',
    });
  });

  it('fails the same way as a plain generation when the provider is down', async () => {
    const { impl } = stubFetch(500, { error: { status: 'INTERNAL' } });
    expect(await provider(impl).generateToolCall({ ...ask, tools })).toMatchObject({
      ok: false,
      failure: 'unavailable',
      retryable: true,
    });
  });
});

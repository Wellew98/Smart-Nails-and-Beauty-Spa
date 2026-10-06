import { describe, expect, it } from 'vitest';
import { DeepSeekProvider } from '@/lib/ai/deepseek';
import type { AIToolDeclaration } from '@/lib/ai/types';

/**
 * The DeepSeek provider's wire format.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAD TO EXIST
 *
 * `tests/ai/privacy.test.ts` proves that no name, phone or manage token reaches
 * the provider — but it does so with a STUB provider, so what it actually
 * proves is that the orchestrator never puts them in `messages`. Everything
 * after that point is the provider's own serialisation, and DeepSeek arrived
 * with 303 lines of it and no coverage at all while Gemini had 38 tests.
 *
 * A redaction call dropped from `toOpenAIMessages` would therefore pass the
 * entire suite. These tests capture the real request body and read it.
 *
 * No network: `fetchImpl` is injected, exactly as the Gemini tests do it.
 * ---------------------------------------------------------------------------
 */

const TOOLS: AIToolDeclaration[] = [
  {
    name: 'get_services',
    description: 'Every treatment currently offered.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/** Captures the single request the provider makes, and answers it. */
function capturing(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    calls,
    body: () => JSON.parse(String(calls[0]?.init?.body ?? '{}')),
    headers: () => (calls[0]?.init?.headers ?? {}) as Record<string, string>,
  };
}

const answer = { choices: [{ message: { content: 'Sure.' } }] };

function provider(fetchImpl: typeof fetch) {
  return new DeepSeekProvider({ apiKey: 'sk-test-key-not-real', model: 'deepseek-chat', fetchImpl });
}

// ---------------------------------------------------------------------------

describe('the credential', () => {
  it('goes in the Authorization header, never the URL', async () => {
    // Anything in a URL ends up in proxy logs, error messages and stack traces.
    // Same rule as Gemini's x-goog-api-key — spec v2 §9.5.
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(capture.calls[0].url).not.toContain('sk-test-key-not-real');
    expect(capture.headers().authorization).toBe('Bearer sk-test-key-not-real');
  });
});

describe('what the customer wrote', () => {
  it('is redacted before it is sent', async () => {
    // The property privacy.test.ts cannot reach, because it stops at the seam.
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [
        { role: 'user', content: 'I am Thandi, call me on 082 555 0101 or thandi@example.co.za' },
      ],
    });

    const sent = JSON.stringify(capture.body());
    expect(sent).not.toContain('082 555 0101');
    expect(sent).not.toContain('thandi@example.co.za');
  });

  it('is redacted on every user turn, not just the last', async () => {
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [
        { role: 'user', content: 'my number is 082 555 0101' },
        { role: 'assistant', content: 'Noted.' },
        { role: 'user', content: 'and my email is thandi@example.co.za' },
      ],
    });

    const sent = JSON.stringify(capture.body());
    expect(sent).not.toContain('082 555 0101');
    expect(sent).not.toContain('thandi@example.co.za');
  });

  it('leaves the studio\'s own details alone', async () => {
    // The bug that already shipped once: a blanket sweep redacts the number the
    // whole site advertises, and the assistant silently stops being able to
    // give it out. Redaction is scoped to user turns for exactly this reason.
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [
        { role: 'assistant', content: 'You can reach the studio on 081 044 4429.' },
      ],
    });

    expect(JSON.stringify(capture.body())).toContain('081 044 4429');
  });
});

describe('the OpenAI wire format', () => {
  it('puts the system prompt first, as a system message', async () => {
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'you are the assistant',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(capture.body().messages[0]).toEqual({
      role: 'system',
      content: 'you are the assistant',
    });
  });

  it('pairs a tool result with the call id that asked for it', async () => {
    // The id is why AIMessage grew toolCallId. OpenAI rejects a tool message
    // whose tool_call_id matches no preceding call, so a mismatch here is a
    // 400 on every turn that used a tool — i.e. most of them.
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [
        { role: 'user', content: 'what do you offer?' },
        {
          role: 'assistant',
          content: '',
          toolCall: { id: 'call_abc', name: 'get_services', args: {} },
        },
        { role: 'tool', toolName: 'get_services', toolCallId: 'call_abc', content: '{"services":[]}' },
      ],
    });

    const messages = capture.body().messages;
    const assistantTurn = messages.find((m: { tool_calls?: unknown }) => m.tool_calls);
    const toolTurn = messages.find((m: { role: string }) => m.role === 'tool');

    expect(assistantTurn.tool_calls[0].id).toBe('call_abc');
    expect(assistantTurn.tool_calls[0].function.name).toBe('get_services');
    expect(toolTurn.tool_call_id).toBe('call_abc');
  });

  it('declares tools in the function-calling shape', async () => {
    const capture = capturing(answer);
    await provider(capture.fetchImpl).generateToolCall({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'what do you offer?' }],
      tools: TOOLS,
    });

    expect(capture.body().tools[0]).toMatchObject({
      type: 'function',
      function: { name: 'get_services' },
    });
  });

  it('reads a tool call back out of the response', async () => {
    const capture = capturing({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_xyz',
                function: { name: 'check_availability', arguments: '{"date":"2026-08-19"}' },
              },
            ],
          },
        },
      ],
    });

    const result = await provider(capture.fetchImpl).generateToolCall({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'anything Wednesday?' }],
      tools: TOOLS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toolCall).toMatchObject({
      id: 'call_xyz',
      name: 'check_availability',
      args: { date: '2026-08-19' },
    });
  });

  it('survives arguments that are not valid JSON', async () => {
    // Model output, so untrusted. A malformed argument string must degrade to
    // "no arguments" and be caught by validation, never throw out of the seam.
    const capture = capturing({
      choices: [
        { message: { tool_calls: [{ id: 'c1', function: { name: 'get_services', arguments: '{oh no' } }] } },
      ],
    });

    const result = await provider(capture.fetchImpl).generateToolCall({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'hello' }],
      tools: TOOLS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toolCall?.args).toEqual({});
  });
});

describe('failure mapping', () => {
  const cases: [number, string, boolean][] = [
    [401, 'unauthorised', false],
    [429, 'rate_limited', true],
    [500, 'unavailable', true],
  ];

  for (const [status, expected, retryable] of cases) {
    it(`maps HTTP ${status} to ${expected}`, async () => {
      const capture = capturing({ error: { message: 'nope' } }, status);
      const result = await provider(capture.fetchImpl).generateResponse({
        systemPrompt: 'be helpful',
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure).toBe(expected);
      expect(result.retryable).toBe(retryable);
    });
  }

  it('never puts the key in the detail it logs', async () => {
    const capture = capturing({ error: { message: 'bad key sk-test-key-not-real' } }, 401);
    const result = await provider(capture.fetchImpl).generateResponse({
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).not.toContain('sk-test-key-not-real');
  });
});

describe('configuration', () => {
  it('refuses to run without a key or a model', async () => {
    const capture = capturing(answer);
    for (const options of [
      { apiKey: '', model: 'deepseek-chat' },
      { apiKey: 'sk-test', model: '' },
    ]) {
      const result = await new DeepSeekProvider({
        ...options,
        fetchImpl: capture.fetchImpl,
      }).generateResponse({ systemPrompt: 'x', messages: [{ role: 'user', content: 'hi' }] });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure).toBe('not_configured');
    }

    // And nothing was sent.
    expect(capture.calls).toHaveLength(0);
  });
});

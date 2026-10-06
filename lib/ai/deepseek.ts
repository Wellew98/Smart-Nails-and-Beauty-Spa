import 'server-only';
import { redactPersonalDetails } from './validation';
import {
  DEFAULT_TIMEOUT_MS,
  resolveTimeoutMs,
  type AIFailureResult,
  type AIMessage,
  type AIResult,
  type AITextResponse,
  type AIToolCall,
  type AIToolCallResponse,
  type AIToolDeclaration,
  type GenerateRequest,
  type ProviderName,
  type ToolCallRequest,
} from './types';
import type { AIProvider } from './provider';

/**
 * DeepSeek, over its OpenAI-compatible REST API.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SEPARATE FROM GEMINI
 *
 * The wire format is different: OpenAI chat completions vs Gemini generateContent.
 * Keeping them separate means each can map its own provider's idiosyncrasies
 * without either one accumulating conditionals for the other.
 * ---------------------------------------------------------------------------
 */

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1';

export interface DeepSeekOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

function failure(
  failureKind: AIFailureResult['failure'],
  detail: string,
  retryable = false,
): AIFailureResult {
  return { ok: false, failure: failureKind, detail, retryable };
}

function describeHttpFailure(status: number, body: unknown): AIFailureResult {
  const error = (body as { error?: { message?: string; type?: string } } | null)?.error;
  const message = typeof error?.message === 'string' ? error.message : '';

  if (status === 401) {
    return failure('unauthorised', 'DeepSeek rejected the API key — check DEEPSEEK_API_KEY');
  }
  if (status === 402) {
    return failure('unauthorised', 'DeepSeek account has insufficient balance');
  }
  if (status === 429) {
    return failure('rate_limited', 'DeepSeek is rate limiting this key', true);
  }
  if (status >= 500) {
    return failure('unavailable', `DeepSeek returned HTTP ${status}`, true);
  }
  return failure(
    'bad_request',
    `DeepSeek rejected the request (HTTP ${status}${message ? `: ${message}` : ''})`,
  );
}

function describeTransportFailure(error: unknown): AIFailureResult {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  const detail =
    typeof code === 'string'
      ? `could not reach DeepSeek (${code})`
      : 'could not reach DeepSeek';
  return failure('unavailable', detail, true);
}

/**
 * Convert our internal message format to OpenAI chat format.
 *
 * System prompt goes as the first message with role "system".
 * Tool calls and tool results use the OpenAI wire format.
 */
function toOpenAIMessages(systemPrompt: string, messages: AIMessage[]) {
  const openai: Record<string, unknown>[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const message of messages) {
    if (message.role === 'tool') {
      openai.push({
        role: 'tool',
        tool_call_id: message.toolCallId ?? 'unknown',
        content: message.content,
      });
    } else if (message.role === 'assistant' && message.toolCall) {
      openai.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: [
          {
            id: message.toolCall.id ?? 'call_1',
            type: 'function',
            function: {
              name: message.toolCall.name,
              arguments: JSON.stringify(message.toolCall.args),
            },
          },
        ],
      });
    } else {
      openai.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content:
          message.role === 'user'
            ? redactPersonalDetails(message.content)
            : message.content,
      });
    }
  }

  return openai;
}

function toOpenAITools(tools: AIToolDeclaration[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function collectToolCalls(
  choice: { message?: { tool_calls?: unknown; content?: unknown } } | undefined,
): AIToolCall | null {
  const toolCalls = choice?.message?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;

  const first = toolCalls[0] as {
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  } | null;

  if (!first?.function?.name || typeof first.function.name !== 'string') return null;

  let args: Record<string, unknown> = {};
  if (typeof first.function.arguments === 'string') {
    try {
      const parsed: unknown = JSON.parse(first.function.arguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Leave args empty
    }
  }

  return {
    id: typeof first.id === 'string' ? first.id : undefined,
    name: first.function.name,
    args,
  };
}

function collectText(
  choice: { message?: { content?: unknown } } | undefined,
): string {
  const content = choice?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

export class DeepSeekProvider implements AIProvider {
  readonly name: ProviderName = 'deepseek';
  readonly model: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(options: DeepSeekOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? DEEPSEEK_ENDPOINT;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async generateResponse(request: GenerateRequest): Promise<AIResult<AITextResponse>> {
    const result = await this.call(request, undefined);
    if (!result.ok) return result;

    const text = collectText(result.value);
    if (!text) {
      return failure('malformed_response', 'DeepSeek returned no text', true);
    }
    return { ok: true, value: { text } };
  }

  async generateToolCall(request: ToolCallRequest): Promise<AIResult<AIToolCallResponse>> {
    const result = await this.call(request, request.tools);
    if (!result.ok) return result;

    const choice = result.value;
    const toolCall = collectToolCalls(choice);
    const text = collectText(choice);

    if (!toolCall && !text) {
      return failure('malformed_response', 'DeepSeek returned neither text nor a tool call', true);
    }

    return { ok: true, value: { text: text || null, toolCall } };
  }

  private async call(
    request: GenerateRequest,
    tools: AIToolDeclaration[] | undefined,
  ): Promise<
    AIResult<{ message?: { tool_calls?: unknown; content?: unknown } } | undefined>
  > {
    if (!this.apiKey) return failure('not_configured', 'DEEPSEEK_API_KEY is not set');
    if (!this.model) return failure('not_configured', 'DEEPSEEK_MODEL is not set');
    if (typeof this.fetchImpl !== 'function') {
      return failure('not_configured', 'no fetch implementation available');
    }

    const timeoutMs = resolveTimeoutMs(request.timeoutMs, this.timeoutMs);
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([timer.signal, request.signal])
      : timer.signal;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOpenAIMessages(request.systemPrompt, request.messages),
      max_tokens: request.maxOutputTokens ?? 800,
      temperature: 0.3,
    };

    if (tools?.length) {
      body.tools = toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (timer.signal.aborted) {
        return failure('timeout', `no answer within ${timeoutMs}ms`, true);
      }
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        return failure('unavailable', 'the request was cancelled');
      }
      return describeTransportFailure(error);
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return response.ok
        ? failure('malformed_response', 'DeepSeek returned a body that was not JSON')
        : failure(
            'unavailable',
            `DeepSeek returned HTTP ${response.status} and no JSON`,
            response.status >= 500,
          );
    }

    if (!response.ok) return describeHttpFailure(response.status, payload);

    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return failure('malformed_response', 'DeepSeek returned no choices');
    }

    return {
      ok: true,
      value: choices[0] as { message?: { tool_calls?: unknown; content?: unknown } },
    };
  }
}

import 'server-only';
import { DeepSeekProvider } from './deepseek';
import { GeminiProvider } from './gemini';
import type {
  AIResult,
  AITextResponse,
  AIToolCallResponse,
  EnvLike,
  GenerateRequest,
  ProviderName,
  ToolCallRequest,
} from './types';

export { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, resolveTimeoutMs } from './types';

/**
 * The seam between this application and whoever is generating text.
 *
 * ---------------------------------------------------------------------------
 * WHY AN INTERFACE AND NOT A DIRECT DEPENDENCY
 *
 * Modelled on `lib/mail.ts`, and for the same reason it worked there: the
 * provider is the part of this feature most likely to change, and the part we
 * control least. Models are deprecated on a schedule, pricing moves, and the
 * one thing that must not happen is that swapping provider means editing the
 * prompt, the tools, or the route. Nothing outside this directory imports
 * `gemini.ts`.
 *
 * WHY NOTHING HERE RETRIES. A retry inside the provider is invisible to the
 * caller: it multiplies every timeout by the retry count, and under a provider
 * outage every visitor's request fans out into several. `retryable` on the
 * failure says whether a later attempt could work, and the decision belongs to
 * whoever is holding the request — which, for a chat message, is usually "tell
 * the customer and let them send it again". The booking engine is unaffected
 * either way; the assistant is a convenience on top of a system that already
 * works without it.
 * ---------------------------------------------------------------------------
 */
export interface AIProvider {
  readonly name: ProviderName;
  /** The model this provider was configured with. Never a literal in code. */
  readonly model: string;

  /** Plain text in, plain text out. No tools offered. */
  generateResponse(request: GenerateRequest): Promise<AIResult<AITextResponse>>;

  /**
   * Offer the model a set of tools and return the one call it chose, if any.
   *
   * Exactly one call per turn. The loop that feeds a tool result back and asks
   * again lives in the caller, where it can be bounded — a provider that ran
   * the loop itself would be an unbounded loop by construction.
   */
  generateToolCall(request: ToolCallRequest): Promise<AIResult<AIToolCallResponse>>;

  supportsToolCalling(): boolean;
}

/**
 * Which provider this deployment is configured for.
 *
 * Explicit `AI_PROVIDER` wins; otherwise it is inferred from whichever
 * credential is present, and a name we do not implement falls through to
 * inference rather than disabling a working deployment. This mirrors
 * `selectedTransport()` in lib/mail.ts deliberately — two seams that behave
 * differently are two things to remember.
 */
export function selectedProvider(env: EnvLike = process.env): ProviderName | null {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === 'deepseek') return 'deepseek';
  if (explicit === 'gemini') return 'gemini';

  if (env.DEEPSEEK_API_KEY) return 'deepseek';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

/**
 * Why the assistant is switched off, in a sentence, or null if it is not.
 *
 * Written for whoever is looking at a deployment that has no assistant, in the
 * same spirit as `lib/health.ts`: name the variable and the fix, never the
 * value. Nothing here can print a key.
 */
export function providerConfigProblem(env: EnvLike = process.env): string | null {
  // The mistake that has already cost this project an incident once: a secret
  // pasted into a NEXT_PUBLIC_ variable, which Next inlines into the browser
  // bundle. An AI key there is a key anyone can read and spend.
  const publicKey = Object.keys(env).find(
    (key) => key.startsWith('NEXT_PUBLIC_') && /GEMINI|DEEPSEEK|AI_KEY|API_KEY/i.test(key),
  );
  if (publicKey) {
    return `${publicKey} is a NEXT_PUBLIC_ variable, so it is inlined into the browser bundle and readable by every visitor. Move the key to a server-only variable and rotate it.`;
  }

  const provider = selectedProvider(env);
  if (!provider) {
    return 'No AI provider configured. Set AI_PROVIDER=deepseek or gemini, the matching API key, and AI_MODEL.';
  }
  if (provider === 'deepseek' && !env.DEEPSEEK_API_KEY) return 'DEEPSEEK_API_KEY is not set.';
  if (provider === 'gemini' && !env.GEMINI_API_KEY) return 'GEMINI_API_KEY is not set.';
  if (!env.AI_MODEL?.trim()) {
    return 'AI_MODEL is not set. There is deliberately no default: a model name baked into the code outlives its own deprecation, and the first symptom is a 404 from the provider months later.';
  }
  return null;
}

export interface ProviderOptions {
  /** Injectable for tests. Defaults to the platform `fetch`. */
  fetchImpl?: typeof fetch;
  /** Overrides the provider's base URL. Tests only. */
  endpoint?: string;
}

/**
 * Build the configured provider, or null when this deployment has none.
 *
 * Null is a normal, expected state — locally, and on any deployment before the
 * AI variables are set. Callers treat it as "the assistant is not available",
 * never as an error, exactly as `getTransport()` is treated in lib/email.ts.
 */
export function getProvider(
  env: EnvLike = process.env,
  options: ProviderOptions = {},
): AIProvider | null {
  if (providerConfigProblem(env)) return null;

  switch (selectedProvider(env)) {
    case 'deepseek':
      return new DeepSeekProvider({
        apiKey: env.DEEPSEEK_API_KEY!,
        model: env.AI_MODEL!.trim(),
        timeoutMs: env.AI_TIMEOUT_MS ? Number(env.AI_TIMEOUT_MS) : undefined,
        ...options,
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey: env.GEMINI_API_KEY!,
        model: env.AI_MODEL!.trim(),
        timeoutMs: env.AI_TIMEOUT_MS ? Number(env.AI_TIMEOUT_MS) : undefined,
        ...options,
      });
    default:
      return null;
  }
}

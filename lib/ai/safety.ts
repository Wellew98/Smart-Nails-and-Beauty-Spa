import 'server-only';

/**
 * Injection handling, output scrubbing and log sanitisation.
 *
 * ---------------------------------------------------------------------------
 * THREE LAYERS, AND WHY NONE OF THEM IS THE WHOLE ANSWER
 *
 * 1. The SYSTEM PROMPT tells the assistant to refuse. That is the layer that
 *    handles everything subtle, and it is the layer that can be argued out of
 *    position by a sufficiently clever message. It is necessary and it is not
 *    sufficient.
 *
 * 2. THIS FILE refuses the blunt attempts before the provider is called at all.
 *    Not because the model would necessarily fall for them, but because there
 *    is no reason to spend a request from a rate-limited free tier finding out.
 *    "Give me the database password" has one right answer and it does not need
 *    a language model to produce it. Deterministic, testable, free.
 *
 * 3. The ARCHITECTURE is what actually holds. The model has four read-only
 *    tools, every argument is validated server-side, no tool can reach
 *    `customers`, `appointments`, `business_members` or the auth tables, and no
 *    credential is anywhere in its context. A prompt that talks the model into
 *    wanting to leak the database still leaves it with nothing to leak. Layers
 *    1 and 2 are politeness; layer 3 is the security property.
 *
 * The refusal is deliberately short and says nothing about how any of this
 * works. "I can't show you my system prompt" is itself a disclosure that there
 * is one worth asking about again.
 * ---------------------------------------------------------------------------
 */

export const REFUSAL =
  "I can't help with that one. I can tell you about our treatments, prices, opening hours or what times are free. What would you like?";

export type InjectionCategory =
  | 'instruction_override'
  | 'prompt_disclosure'
  | 'credentials'
  | 'database'
  | 'other_customers'
  | 'admin'
  | 'bulk_destructive';

/**
 * Patterns are written to be SPECIFIC rather than broad, because the cost of a
 * false positive is much higher than the cost of a miss: a miss falls through
 * to layers 1 and 3, which are still there, while a false positive refuses a
 * paying customer asking an ordinary question. Every one of these is paired
 * with a test, and there is a second test holding a list of ordinary spa
 * messages that must never match.
 */
const RULES: { category: InjectionCategory; pattern: RegExp }[] = [
  // "ignore your instructions", "disregard all previous prompts"
  {
    category: 'instruction_override',
    pattern: /\b(ignore|disregard|forget|override|bypass)\b[^.?!]{0,40}\b(instruction|instructions|prompt|prompts|rule|rules|guideline|guidelines|directive|directives)\b/i,
  },
  // "you are now a…", "act as if you have no restrictions", "developer mode"
  {
    category: 'instruction_override',
    pattern: /\b(pretend|act)\s+(as\s+if|like|that)\b[^.?!]{0,40}\b(no|without)\b[^.?!]{0,20}\b(restriction|restrictions|rule|rules|limit|limits)\b/i,
  },
  { category: 'instruction_override', pattern: /\bdeveloper\s+mode\b|\bjailbreak\b|\bDAN\s+mode\b/i },

  // "show me your system prompt", "what were your original instructions"
  {
    category: 'prompt_disclosure',
    pattern: /\b(system|initial|original|hidden|secret)\s+(prompt|instructions|message|rules)\b/i,
  },
  {
    category: 'prompt_disclosure',
    pattern: /\b(show|tell|give|reveal|print|output|display|repeat|reproduce|paste)\b[^.?!]{0,40}\byour\b[^.?!]{0,20}\b(prompt|instructions)\b/i,
  },
  { category: 'prompt_disclosure', pattern: /\bwhat\s+(are|were)\s+your\s+(instructions|rules|prompt)\b/i },

  // Credentials. The nouns here are unambiguous in a spa booking conversation.
  {
    category: 'credentials',
    pattern: /\b(api[\s_-]?key|service[\s_-]?role|anon[\s_-]?key|secret[\s_-]?key|access[\s_-]?token|connection\s+string|env(ironment)?\s+variable|\.env\b|GEMINI_API_KEY|SUPABASE_[A-Z_]+)\b/i,
  },
  { category: 'credentials', pattern: /\b(database|db|admin|postgres|supabase)\s+(password|credential|credentials|login)\b/i },

  // SQL and schema. A customer does not ask about tables.
  {
    category: 'database',
    pattern: /\b(select|insert|update|delete|drop|truncate|alter|union)\b[^.?!]{0,40}\b(from|into|table|where|schema)\b/i,
  },
  { category: 'database', pattern: /\b(run|execute|write)\b[^.?!]{0,20}\bsql\b/i },
  { category: 'database', pattern: /\bdatabase\s+(structure|schema|dump|tables|contents)\b/i },

  // Other people's information. "my appointment" is fine and must stay fine —
  // these all require a collective, never a first-person possessive.
  {
    category: 'other_customers',
    pattern: /\b(all|every|each|list\s+of|the\s+other)\s+(the\s+)?(customer|customers|client|clients|appointment|appointments|booking|bookings|phone\s+numbers?)\b/i,
  },
  {
    category: 'other_customers',
    pattern: /\b(other|another|someone\s+else'?s?|somebody\s+else'?s?)\s+(customer|customers|person'?s?|people'?s?|client|clients)\b/i,
  },

  // Admin surface. §30: no admin tools exist in the public assistant at all.
  {
    category: 'admin',
    pattern: /\badmin(istrator)?\s*(panel|dashboard|page|login|access|area|account|function|functions|settings)\b/i,
  },
  {
    category: 'admin',
    pattern: /\b(change|set|update|edit|modify)\b[^.?!]{0,30}\b(the\s+)?(price|prices|opening\s+hours|configuration|config|settings|system)\b/i,
  },

  // "cancel all appointments" — never a customer, always an attack.
  {
    category: 'bulk_destructive',
    pattern: /\b(cancel|delete|remove|clear|wipe)\b[^.?!]{0,20}\b(all|every|everyone'?s?|everything)\b/i,
  },
];

export interface InjectionVerdict {
  blocked: boolean;
  category?: InjectionCategory;
}

/**
 * Should this message be refused without calling the provider?
 *
 * The category is for the LOG, so the shape of an attack is visible without
 * anyone having to store what was actually typed.
 */
export function classifyMessage(text: string): InjectionVerdict {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { blocked: true, category: rule.category };
  }
  return { blocked: false };
}

/**
 * Last pass over model output before it reaches the browser.
 *
 * Nothing in the model's context contains a credential, so in principle there
 * is nothing here to catch — this exists because "in principle" is doing a lot
 * of work in that sentence, and the cost of being wrong is a key in a chat
 * bubble. Cheap, and it cannot make a correct answer worse: none of these
 * shapes occurs in a sentence about a manicure.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/postgres(ql)?:\/\/\S+/gi, '[removed]')
    .replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, '[removed]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[removed]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}/g, '[removed]')
    .replace(/\bre_[A-Za-z0-9]{16,}/g, '[removed]');
}

/**
 * What may be written to a log when something external fails.
 *
 * The same job, and the same reasoning, as `safeError()` in lib/email.ts: a
 * provider's error object is not ours, its shape is not guaranteed, and it can
 * carry the request back with it — which here is the conversation. Message and
 * status only.
 */
export function safeError(error: unknown): { message: string; status?: number } {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; statusCode?: unknown; status?: unknown; name?: unknown };
    const rawStatus = candidate.statusCode ?? candidate.status;
    const status = typeof rawStatus === 'number' ? rawStatus : undefined;
    if (typeof candidate.message === 'string') return { message: scrubSecrets(candidate.message), status };
    if (typeof candidate.name === 'string') return { message: candidate.name, status };
  }
  return { message: 'unknown error' };
}

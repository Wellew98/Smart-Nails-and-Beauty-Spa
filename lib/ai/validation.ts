import 'server-only';
import { z } from 'zod';
import { TOOL_NAMES, type ToolName } from './types';

/**
 * Strict validation of everything the model produces.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SEPARATE FROM tools.ts
 *
 * A tool call is untrusted input. It looks like it comes from us — we wrote the
 * declarations, we chose the parameter names — but it is generated text from a
 * remote service, shaped by whatever the customer typed. A uuid the model
 * "remembers" from earlier in the conversation, a date it invented, a therapist
 * name that does not exist: all of these arrive looking exactly like valid
 * arguments.
 *
 * Keeping validation in its own module makes it structurally impossible for a
 * tool to read a raw argument by accident: `executeTool` validates first and
 * hands the tool a typed value, and the tools take no `unknown`.
 * ---------------------------------------------------------------------------
 */

/**
 * Nothing the model sends us has any business being longer than this. A cap
 * bounds the work a malformed call can cause before it is rejected.
 */
export const MAX_ARG_LENGTH = 120;

/**
 * 'YYYY-MM-DD', and a date that actually exists.
 *
 * The regex alone accepts 2026-02-31. Round-tripping through Date.UTC is the
 * cheapest way to reject the days that do not exist, which a model asked for
 * "the 31st of next month" will happily produce.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const roundTrip = new Date(Date.UTC(y, m - 1, d));
    return (
      roundTrip.getUTCFullYear() === y &&
      roundTrip.getUTCMonth() === m - 1 &&
      roundTrip.getUTCDate() === d
    );
  }, 'that date does not exist');

/**
 * `strictObject` throughout: an unexpected key is a rejection, not something to
 * ignore. A model that has started inventing parameters is a model whose other
 * arguments are worth doubting too.
 */
const noArguments = z.strictObject({});

export const checkAvailabilityArgs = z.strictObject({
  service_id: z.uuid(),
  date: isoDate,
  /**
   * A therapist's NAME, not an id. `get_staff` deliberately returns no ids, so
   * a name is the only handle the model has; the id is resolved server-side
   * against the active staff who actually perform the service.
   */
  staff_name: z.string().trim().min(1).max(MAX_ARG_LENGTH).optional(),
});

export type CheckAvailabilityArgs = z.infer<typeof checkAvailabilityArgs>;

const SCHEMAS = {
  get_business_info: noArguments,
  get_services: noArguments,
  get_staff: noArguments,
  check_availability: checkAvailabilityArgs,
  /**
   * No arguments, and `noArguments` is strict, so a model that tries to pass a
   * manage token, an appointment id or a customer name is REJECTED here rather
   * than having the extra field quietly ignored. Which booking is being read is
   * decided by the token in ToolContext and by nothing the model can say.
   */
  get_booking: noArguments,
} as const satisfies Record<ToolName, z.ZodType>;

export function isToolName(name: unknown): name is ToolName {
  return typeof name === 'string' && (TOOL_NAMES as readonly string[]).includes(name);
}

export type ValidationOutcome =
  | { ok: true; tool: ToolName; args: Record<string, unknown> }
  | { ok: false; error: 'unknown_tool' | 'invalid_arguments'; message: string };

/**
 * Validate a tool call before anything touches the database.
 *
 * The message is written for the MODEL to read and correct itself with — it is
 * handed back as the tool result — so it names the parameter and what was
 * wrong, and never quotes the offending value back. Echoing input into a
 * message is how a bad argument becomes a bad log line.
 */
export function validateToolCall(name: unknown, rawArgs: unknown): ValidationOutcome {
  if (!isToolName(name)) {
    return {
      ok: false,
      error: 'unknown_tool',
      message: `No such tool. Available tools: ${TOOL_NAMES.join(', ')}.`,
    };
  }

  // Gemini omits `args` entirely for a no-argument call; treat that as {}.
  const candidate = rawArgs ?? {};
  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, error: 'invalid_arguments', message: 'Arguments must be an object.' };
  }

  const parsed = SCHEMAS[name].safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') || 'arguments';
    return {
      ok: false,
      error: 'invalid_arguments',
      message: `Invalid ${path}: ${issue?.message ?? 'rejected'}.`,
    };
  }

  return { ok: true, tool: name, args: parsed.data as Record<string, unknown> };
}

/**
 * Strip anything that looks like a phone number out of text a CUSTOMER wrote,
 * on its way to the provider.
 *
 * Who this is applied to matters as much as what it does, and the caller
 * decides: `gemini.ts` runs it over user turns only, never over tool results —
 * one of which is the studio's own public phone number. Read the note above
 * `toGeminiContents` before widening it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT ONLY IN THE PROMPT
 *
 * The assistant is told not to take a phone number in conversation, and the
 * client is meant to capture it in a form and post it straight to the booking
 * route. Both of those are instructions, and instructions get forgotten — by a
 * model that decides to be helpful, and by whoever builds the next batch. This
 * is the last gate before the wire, so the property holds even when the layers
 * above it do not. Same instinct as the demo banner being derived from the data
 * rather than a flag (spec v2 §2): make the safety property structural.
 *
 * WHAT IT CANNOT DO. It cannot redact a NAME. "I'm Thandi" is indistinguishable
 * from any other word, and a heuristic that tried would mangle ordinary
 * sentences. Names are held out by the prompt and by the client, and this
 * function makes no claim about them.
 *
 * The threshold is nine digits because a South African number has nine after
 * the leading zero or +27. Times ('10:00'), prices ('R320'), dates
 * ('2026-08-11') and durations ('45 min') all fall well short of it, and a
 * colon is not an accepted separator, so none of them are touched. The
 * separator class excludes newlines so a numbered list cannot be read as one
 * long number.
 *
 * Email addresses go too. They are personal information under POPIA exactly as
 * a phone number is, and they are the one other identifier a customer will type
 * unprompted.
 * ---------------------------------------------------------------------------
 */
export const REDACTED_PHONE = '[phone number removed]';
export const REDACTED_EMAIL = '[email address removed]';

const PHONE_LIKE = /(?:\+|00)?\d[\d ().-]{7,20}\d/g;
const EMAIL_LIKE = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}/gi;

export function redactPersonalDetails(text: string): string {
  return text.replace(EMAIL_LIKE, REDACTED_EMAIL).replace(PHONE_LIKE, (match) => {
    const digits = match.replace(/\D/g, '').length;
    return digits >= 9 ? REDACTED_PHONE : match;
  });
}

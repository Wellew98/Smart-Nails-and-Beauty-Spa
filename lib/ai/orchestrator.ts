import 'server-only';
import { getAvailableSlots, getBusiness, getService } from '../availability';
import { getAppointmentById } from '../booking';
import { sendCustomerConfirmation, sendOwnerNotification } from '../email';
import { getActiveStaff } from '../public-data';
import { formatSlotLabel, todayInZone, utcToZonedDate } from '../time';
import { classifyMessage, REFUSAL, safeError, scrubSecrets } from './safety';
import { buildSystemPrompt } from './system-prompt';
import {
  TOOL_DECLARATIONS,
  cancelBookingTool,
  createBookingTool,
  executeTool,
  rescheduleBookingTool,
  type ToolContext,
} from './tools';
import type { AIProvider } from './provider';
import type {
  AIFailure,
  AIFailureResult,
  AIMessage,
  AIResult,
  ChatAttachment,
  EnvLike,
} from './types';

/**
 * The bounded tool loop.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THIS TERMINATE
 *
 * At most `maxToolCalls` tool executions, then exactly one final provider call
 * with no tools offered — so the model has no way to ask for another one and
 * must answer in prose. Total provider calls are therefore never more than
 * `maxToolCalls + 1`, whatever the model does, and there is no recursion and
 * no retry anywhere in the path. A model that decides to call `get_services`
 * forty times in a row costs a bounded number of requests and still produces
 * an answer.
 *
 * WHY THE LOOP IS HERE AND NOT IN THE PROVIDER. A provider that ran the loop
 * itself would be an unbounded loop by construction, and the bound is the
 * whole point — see the note in provider.ts.
 *
 * WHAT THE CLIENT NEVER SEES. Tool calls and tool results stay inside one
 * request. The browser holds plain user and assistant text and nothing else,
 * so a client cannot replay a forged tool result and cannot learn an internal
 * id it was not given deliberately.
 * ---------------------------------------------------------------------------
 */

export interface Limits {
  maxToolCalls: number;
  maxOutputTokens: number;
  maxMessages: number;
  maxMessageLength: number;
  /**
   * How long the WHOLE turn may take, across every provider call in it.
   *
   * Bounding each call separately is not enough, and the arithmetic is the
   * reason: `maxToolCalls + 1` calls at the provider's own 20-second timeout is
   * a turn that can legitimately run for a minute and a half. The platform
   * would cut it off first, and a truncated request looks exactly like a broken
   * assistant — no reply, no fallback, no log line saying why.
   *
   * So the turn carries a deadline and each call gets whatever is left of it.
   * `maxDuration` on the route is then set above this with headroom, and the
   * customer gets a sentence rather than a hung request.
   */
  turnBudgetMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxToolCalls: 4,
  maxOutputTokens: 800,
  maxMessages: 20,
  maxMessageLength: 1000,
  turnBudgetMs: 25_000,
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function limitsFrom(env: EnvLike = process.env): Limits {
  return {
    maxToolCalls: positiveInt(env.AI_MAX_TOOL_CALLS, DEFAULT_LIMITS.maxToolCalls),
    maxOutputTokens: positiveInt(env.AI_MAX_OUTPUT_TOKENS, DEFAULT_LIMITS.maxOutputTokens),
    maxMessages: positiveInt(env.AI_MAX_MESSAGES, DEFAULT_LIMITS.maxMessages),
    maxMessageLength: positiveInt(env.AI_MAX_MESSAGE_LENGTH, DEFAULT_LIMITS.maxMessageLength),
    turnBudgetMs: positiveInt(env.AI_TURN_BUDGET_MS, DEFAULT_LIMITS.turnBudgetMs),
  };
}

/**
 * What the customer is told when the assistant cannot answer.
 *
 * Never a provider name, never an HTTP status, never "Gemini returned 429" —
 * spec §35. The customer does not care whose fault it is and cannot act on it.
 * What they can act on is the booking page, which is working.
 */
export const FALLBACK_MESSAGE =
  "I'm having trouble with the assistant right now. You can still see everything and book on our booking page.";

export const BUSY_MESSAGE =
  "I'm getting a lot of questions at the moment. You can book straight away on our booking page, or try me again in a few minutes.";

const UNRESOLVED_MESSAGE =
  "I couldn't get that one straight. Our booking page has the full list of treatments and times.";

export interface OrchestrateRequest {
  /** User and assistant turns from the client. Nothing else is accepted. */
  messages: AIMessage[];
  businessId: string;
  provider: AIProvider;
  limits?: Limits;
  now?: Date;
  signal?: AbortSignal;
  /** From the request envelope. Reaches `get_booking`, never the conversation. */
  manageToken?: string | null;
}

export interface OrchestrateResult {
  reply: string;
  attachments: ChatAttachment[];
  /** True when the reply is a fallback rather than something the model said. */
  degraded: boolean;
}

/** Narrow an AIResult to its failure branch. Needed because TypeScript cannot
 * narrow generic discriminated unions inside a conditional. */
function isRetryable<T>(result: AIResult<T>): result is AIResult<T> & AIFailureResult {
  return !result.ok && (result as AIFailureResult).retryable;
}

/**
 * Call the provider, retrying ONCE on intermittent failures.
 *
 * Gemini's free tier occasionally returns a candidate with no parts at all — a
 * known, intermittent provider bug (github.com/livekit/agents/issues/4066) that
 * one retry covers.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THIS DELIBERATELY WILL NOT RETRY.
 *
 * A SPENT BUDGET. `retryable` says a later attempt could plausibly succeed; it
 * says nothing about whether there is time for one. Without the deadline check
 * a call that timed out having consumed the whole turn budget was retried with
 * `remaining()` already negative — and `resolveTimeoutMs` turns any
 * non-positive value into the full 20-second default, so the "bounded" turn
 * quietly ran to 45 seconds. The budget has to be re-checked here, exactly as
 * the loop re-checks it before every other call.
 *
 * A RATE LIMIT. The provider has just asked us to slow down; sending the same
 * request again immediately is the one response guaranteed to make it worse,
 * and on a metered free tier it spends quota to do so. `rate_limited` stays
 * `retryable: true` because that is true of a LATER attempt — the customer
 * gets BUSY_MESSAGE and can try again in a minute. Retry policy belongs here,
 * not in the provider's description of what happened.
 * ---------------------------------------------------------------------------
 */
async function withRetry<T>(
  fn: () => Promise<AIResult<T>>,
  label: string,
  remainingMs: () => number,
): Promise<AIResult<T>> {
  const result = await fn();
  if (!isRetryable(result)) return result;

  if (result.failure === 'rate_limited') return result;
  if (remainingMs() <= 0) {
    console.warn('[ai] not retrying, turn budget spent', { label, failure: result.failure });
    return result;
  }

  console.warn('[ai] retrying after retryable failure', { label, detail: result.detail });
  return fn();
}

export async function orchestrate(request: OrchestrateRequest): Promise<OrchestrateResult> {
  const { messages, businessId, provider, signal } = request;
  const limits = request.limits ?? limitsFrom();
  const now = request.now ?? new Date();

  // Layer 2 of safety.ts: the blunt attempts are refused here, before a request
  // is spent on a rate-limited key finding out that the model would also have
  // refused. Only the newest customer turn is classified — an older one has
  // already been answered, and re-refusing it would make the assistant
  // unusable for the rest of the conversation.
  const latest = [...messages].reverse().find((message) => message.role === 'user');
  if (latest) {
    const verdict = classifyMessage(latest.content);
    if (verdict.blocked) {
      // The category, never the message. Knowing an attack happened and what
      // shape it was is operational; keeping what was typed is a log of
      // customer conversations, which §48 forbids.
      console.warn('[ai] message refused', { category: verdict.category });
      return { reply: REFUSAL, attachments: [], degraded: false };
    }
  }

  const business = await getBusiness(businessId);
  if (!business) return degraded(FALLBACK_MESSAGE);

  const systemPrompt = buildSystemPrompt({
    businessName: business.name,
    today: todayInZone(business.timezone, now),
  });

  const context: ToolContext = { businessId, now, manageToken: request.manageToken ?? null };
  const turns: AIMessage[] = [...messages];
  const attachments: ChatAttachment[] = [];

  // Wall-clock, deliberately not `now`: `now` is domain time and tests inject a
  // fixed one to reason about availability, which would make a deadline built
  // from it either already past or hours away.
  const deadline = Date.now() + limits.turnBudgetMs;
  const remaining = () => deadline - Date.now();

  for (let executed = 0; executed < limits.maxToolCalls; executed++) {
    if (remaining() <= 0) return outOfTime(attachments);

    const result = await withRetry(
      () =>
        provider.generateToolCall({
          systemPrompt,
          messages: turns,
          tools: TOOL_DECLARATIONS,
          maxOutputTokens: limits.maxOutputTokens,
          timeoutMs: remaining(),
          signal,
        }),
      `tool-call-${executed}`,
      remaining,
    );

    if (!result.ok) return providerFailure(result.failure, result.detail, attachments);

    const { text, toolCall } = result.value;
    if (!toolCall) {
      return { reply: finalText(text), attachments, degraded: false };
    }

    turns.push({ role: 'assistant', content: text ?? '', toolCall });

    const outcome = await executeTool(toolCall.name, toolCall.args, context);
    if (outcome.ok && outcome.client) {
      // The client projection. Replaces any earlier one of the same kind: a
      // conversation that checks Friday and then Saturday should leave the
      // customer looking at Saturday's times, not both days stacked up.
      const index = attachments.findIndex((existing) => existing.kind === outcome.client!.kind);
      if (index >= 0) attachments.splice(index, 1);
      attachments.push(outcome.client);
    }

    turns.push({
      role: 'tool',
      toolName: outcome.tool,
      toolCallId: toolCall.id,
      // Only the model projection crosses back into the conversation. The
      // client projection carries ids and never goes near the provider.
      content: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error, message: outcome.message }),
    });
  }

  // The ceiling. One more turn with NO tools offered, so the model has to
  // answer with what it already has rather than asking for a fifth thing.
  if (remaining() <= 0) return outOfTime(attachments);

  const final = await withRetry(
    () =>
      provider.generateResponse({
        systemPrompt,
        messages: turns,
        maxOutputTokens: limits.maxOutputTokens,
        timeoutMs: remaining(),
        signal,
      }),
    'final-response',
    remaining,
  );

  if (!final.ok) return providerFailure(final.failure, final.detail, attachments);
  return { reply: finalText(final.value.text), attachments, degraded: false };
}

function finalText(text: string | null): string {
  const scrubbed = scrubSecrets((text ?? '').trim());
  return scrubbed || UNRESOLVED_MESSAGE;
}

function degraded(reply: string, attachments: ChatAttachment[] = []): OrchestrateResult {
  return { reply, attachments, degraded: true };
}

/**
 * The turn ran out of budget. Answer with a sentence and whatever was already
 * found, rather than starting a call the platform is about to cut off.
 */
function outOfTime(attachments: ChatAttachment[]): OrchestrateResult {
  console.warn('[ai] turn budget exhausted');
  return degraded(FALLBACK_MESSAGE, attachments);
}

/**
 * Every provider failure becomes the same customer-facing sentence.
 *
 * Distinguishing them for the CUSTOMER would be false precision — there is
 * nothing they can do differently about a timeout than about a rate limit. The
 * distinction is kept in the log, where somebody can act on it.
 */
function providerFailure(
  failure: AIFailure,
  detail: string,
  attachments: ChatAttachment[],
): OrchestrateResult {
  console.error('[ai] provider failure', { failure, detail: safeError({ message: detail }).message });
  return degraded(failure === 'rate_limited' ? BUSY_MESSAGE : FALLBACK_MESSAGE, attachments);
}

// ---------------------------------------------------------------------------
// Structured actions from the client
// ---------------------------------------------------------------------------

/**
 * A tap that only CONTINUES the conversation. Nothing is written.
 */
export type ConversationAction =
  | { kind: 'service'; serviceId: string }
  | { kind: 'slot'; serviceId: string; startsAt: string; staffId?: string | null };

/**
 * A tap that WRITES. Everything the write needs is carried here, because none
 * of it may be taken from the model: the identity comes from the customer's own
 * client, and the idempotency key was minted at the moment they pressed the
 * button (see components/ai/chat-window.tsx).
 *
 * Kept a separate type from ConversationAction so the compiler enforces the
 * split — `describeAction` cannot be handed a write, and `performWrite` cannot
 * be handed a browse. That is one fewer thing resting on a reviewer noticing.
 */
export type WriteAction =
  | {
      kind: 'confirm_booking';
      serviceId: string;
      startsAt: string;
      staffId?: string | null;
      name: string;
      phone: string;
      email?: string | null;
      idempotencyKey: string;
    }
  | { kind: 'confirm_cancel' }
  | { kind: 'confirm_reschedule'; startsAt: string; staffId?: string | null };

export type ClientAction = ConversationAction | WriteAction;

/** The three taps that write. Everything else only continues the conversation. */
export function isWriteAction(action: ClientAction): action is WriteAction {
  return (
    action.kind === 'confirm_booking' ||
    action.kind === 'confirm_cancel' ||
    action.kind === 'confirm_reschedule'
  );
}

export interface WriteOutcomeForClient {
  /** The turn the assistant is asked to narrate. Never invented by the model. */
  turn: string;
  attachment: ChatAttachment | null;
  /**
   * The appointment this write touched, when it succeeded.
   *
   * Exists so the route can attach the transcript to the customer behind it —
   * which is what puts a stored conversation inside the reach of §9.4 "delete
   * my details". It is NOT part of what the model sees and must not become so:
   * `turn` is the model's whole view of what happened here.
   */
  appointmentId?: string;
}

/**
 * Perform a confirmed write, then hand the RESULT to the conversation.
 *
 * ---------------------------------------------------------------------------
 * THE TAP AUTHORISES, THE SERVER EXECUTES, THE MODEL NARRATES.
 *
 * The model is not asked whether to book. It is told what happened and asked to
 * put it into a sentence. That ordering is what makes "never book because the
 * customer said something that sounded like yes" true by construction rather
 * than by instruction — and it also means the assistant cannot report a success
 * the database did not return, because the sentence it is narrating is built
 * from the transaction's own result.
 *
 * A failure is narrated just as plainly. §5 step 8's `slot_taken` is an
 * expected outcome, not an error: somebody booked it through /book while this
 * conversation was open. No retry, no force, no claim of success.
 * ---------------------------------------------------------------------------
 */
export async function performWrite(
  action: WriteAction,
  context: ToolContext,
): Promise<WriteOutcomeForClient | null> {
  if (action.kind === 'confirm_booking') {
    const startsAt = new Date(action.startsAt);
    if (Number.isNaN(startsAt.getTime())) return null;

    const outcome = await createBookingTool(context, {
      serviceId: action.serviceId,
      startsAt,
      staffId: action.staffId ?? null,
      name: action.name,
      phone: action.phone,
      email: action.email ?? null,
      idempotencyKey: action.idempotencyKey,
    });

    if (outcome.ok) {
      // The confirmation email is dispatched by the same helpers /book uses —
      // not a second mail path. A replay must not send a second copy.
      if (!outcome.replayed) void sendConfirmationFor(outcome.appointmentId);
      return {
        turn: `[The booking was written to the database and confirmed. ${describe(outcome.data)} Tell the guest it is booked, and that their confirmation and booking link are on the way.]`,
        attachment: outcome.client,
        appointmentId: outcome.appointmentId,
      };
    }

    return {
      turn:
        outcome.error === 'slot_taken'
          ? '[The booking FAILED: somebody else took that time while the guest was confirming. Say so plainly, apologise briefly, and offer the alternative times shown. Do not say it is booked.]'
          : `[The booking FAILED and nothing was written. Reason: ${outcome.message} Tell the guest plainly. Do not say it is booked.]`,
      attachment: outcome.client ?? null,
    };
  }

  if (action.kind === 'confirm_cancel') {
    const outcome = await cancelBookingTool(context);
    return outcome.ok
      ? { turn: '[The booking is now cancelled in the database. Confirm that to the guest.]', attachment: outcome.client, appointmentId: outcome.appointmentId }
      : { turn: `[The cancellation FAILED and the booking still stands. Reason: ${outcome.message} Tell the guest plainly.]`, attachment: null };
  }

  if (action.kind === 'confirm_reschedule') {
    const startsAt = new Date(action.startsAt);
    if (Number.isNaN(startsAt.getTime())) return null;

    const outcome = await rescheduleBookingTool(context, {
      startsAt,
      staffId: action.staffId ?? null,
    });

    if (outcome.ok) {
      if (!outcome.replayed) void sendConfirmationFor(outcome.appointmentId);
      return {
        turn: `[The booking was moved in the database. ${describe(outcome.data)} Confirm the new time to the guest and tell them their existing booking link still works.]`,
        attachment: outcome.client,
        appointmentId: outcome.appointmentId,
      };
    }

    return {
      turn:
        outcome.error === 'slot_taken'
          ? '[The move FAILED: that time went while the guest was confirming, and the ORIGINAL booking is unchanged. Say so and offer the alternatives shown.]'
          : `[The move FAILED and the original booking is unchanged. Reason: ${outcome.message} Tell the guest plainly.]`,
      attachment: outcome.client ?? null,
    };
  }

  return null;
}

/** Non-personal facts only — service, date, time, therapist. Never who. */
function describe(data: Record<string, unknown>): string {
  const parts = [data.service, data.date, data.time, data.with].filter(Boolean);
  return parts.length ? `It is ${parts.join(', ')}.` : '';
}

/**
 * The same helpers /book uses, not a second mail path.
 *
 * Fire-and-forget for the same reason the booking route uses `after()`: a
 * booking safely in the database must never be reported as a failure because a
 * mail server had a bad minute. lib/email.ts already never throws into a write
 * path; this catch is belt and braces around the dispatch itself.
 */
async function sendConfirmationFor(appointmentId: string): Promise<void> {
  try {
    const detail = await getAppointmentById(appointmentId);
    if (!detail) return;
    await Promise.all([sendCustomerConfirmation(detail), sendOwnerNotification(detail)]);
  } catch (error) {
    console.error('[ai] confirmation email failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

/**
 * Turn a tapped button into a customer turn — after checking it against the
 * database, not before.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT SIMPLY TRUSTED
 *
 * The payload arrives from the browser, so it carries exactly as much authority
 * as model output: none. Anyone can post this endpoint by hand. If a tapped
 * slot were turned into "I'll take 15:00 with Sarah" on the client's word
 * alone, a forged action would put a time that was never offered into the
 * conversation, and the assistant would repeat it back as though the engine
 * had produced it.
 *
 * So the service is looked up, and the instant is checked against the live
 * availability engine — the same one that offered it. Booking does not exist
 * yet, and this is the point at which establishing the pattern is cheap: when
 * it does, the difference between validating here and trusting here is the
 * difference between a rejected action and a booking nobody asked for.
 * ---------------------------------------------------------------------------
 */
export async function describeAction(
  action: ConversationAction,
  context: ToolContext,
): Promise<string | null> {
  const business = await getBusiness(context.businessId);
  if (!business) return null;

  const service = await getService(action.serviceId);
  if (!service || !service.active || service.business_id !== context.businessId) return null;

  if (action.kind === 'service') {
    return `I'm interested in the ${service.name}.`;
  }

  const startsAt = new Date(action.startsAt);
  if (Number.isNaN(startsAt.getTime())) return null;

  const date = utcToZonedDate(startsAt, business.timezone);
  const slots = await getAvailableSlots({
    businessId: context.businessId,
    serviceId: service.id,
    date,
    now: context.now,
  });

  const match = slots.find((slot) => slot.startsAt.getTime() === startsAt.getTime());
  const label = formatSlotLabel(startsAt, business.timezone);

  if (!match) {
    // Honest rather than silent. The slot may simply have gone while the
    // customer was reading, which is the same race /book handles, and the
    // assistant should offer alternatives rather than pretend.
    return `I was looking at ${label} on ${date} for the ${service.name}, but it seems to have gone. What else is there?`;
  }

  // The therapist is named only if she was resolved to the customer's request.
  // Naming whoever happened to sort first would tell the customer they had
  // chosen someone they never chose.
  if (action.staffId) {
    const staff = await getActiveStaff(context.businessId);
    const requested = staff.find((member) => member.id === action.staffId);
    if (requested && match.staffId === requested.id) {
      return `I'd like ${label} on ${date} for the ${service.name} with ${requested.name}.`;
    }
  }

  return `I'd like ${label} on ${date} for the ${service.name}.`;
}

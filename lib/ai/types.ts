/**
 * Shared types and constants for the booking assistant.
 *
 * Deliberately free of imports so that anything may depend on it — the prompt
 * builder, which must stay testable without a database, and `gemini.ts`, which
 * has to be able to read the timeout policy without importing `provider.ts` and
 * closing a module cycle.
 *
 * ---------------------------------------------------------------------------
 * TWO PROPERTIES THIS FILE EXISTS TO ENFORCE
 *
 * 1. FAILURE IS A VALUE, NOT AN EXCEPTION. Every provider call returns
 *    `AIResult`, so a caller cannot forget to handle a timeout or a rate limit
 *    the way it can forget a try/catch. The assistant is a convenience on top
 *    of a booking system that already works; it must degrade to "I can't reach
 *    that right now" and never to a 500.
 *
 * 2. NOTHING PERSONAL CROSSES THIS BOUNDARY. There is no field anywhere in
 *    these types for a customer's name, phone, email or booking history. The
 *    assistant may ask for those details; the client captures them and posts
 *    them to the booking route directly. They never enter the model's context.
 * ---------------------------------------------------------------------------
 */

export type EnvLike = Record<string, string | undefined>;

/** The only provider implemented. The application never names it directly. */
export type ProviderName = 'gemini' | 'deepseek';

/**
 * How long any single provider call may take.
 *
 * Bounded because these run inside a request. `lib/mail.ts` learned this the
 * expensive way: nodemailer's two-minute default, combined with `after()`
 * keeping the function alive, held a serverless function open for two minutes
 * to deliver a message that was never going to arrive. A generation that has
 * not answered in twenty seconds is not going to feel like a chat anyway.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** An upper bound on the bound, so a mistyped env var cannot remove it. */
export const MAX_TIMEOUT_MS = 60_000;

export function resolveTimeoutMs(requested: number | undefined, configured?: number): number {
  const value = requested ?? configured ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, MAX_TIMEOUT_MS);
}

/**
 * Everything that can go wrong with a provider call, as a closed set.
 *
 * Closed rather than a free-text code so the caller can switch on it
 * exhaustively: each of these has a different right answer for the customer
 * ("try again in a moment" vs "the assistant is off right now").
 */
export type AIFailure =
  /** No key, no model, or no provider selected. Normal before the env is set. */
  | 'not_configured'
  /** The provider rejected the credential. A person has to fix this. */
  | 'unauthorised'
  /** The provider asked us to slow down. */
  | 'rate_limited'
  /** We gave up waiting. Bounded by design — see provider.ts. */
  | 'timeout'
  /** The provider is down, unreachable, or answered 5xx. */
  | 'unavailable'
  /** A 200 whose body was not the shape the API documents. */
  | 'malformed_response'
  /** The provider's own safety filter stopped the answer. */
  | 'blocked'
  /** We sent something the provider would not accept. Our bug, not theirs. */
  | 'bad_request';

export interface AIFailureResult {
  ok: false;
  failure: AIFailure;
  /**
   * Operational detail, safe to log: what failed and roughly why.
   *
   * Never a prompt, a conversation, an API key or a provider request body —
   * same rule as `safeError()` in lib/email.ts, and for the same reason. A log
   * drain is outside anything a customer can ask us to erase.
   */
  detail: string;
  /**
   * Whether trying again later could plausibly succeed.
   *
   * This is information for the caller, NOT an instruction to retry — nothing
   * in lib/ai retries anything. See the note in provider.ts.
   */
  retryable: boolean;
}

export type AIResult<T> = { ok: true; value: T } | AIFailureResult;

export type AIRole = 'user' | 'assistant' | 'tool';

/**
 * One turn of conversation.
 *
 * `user` and `assistant` turns are the ones the CLIENT holds and sends back —
 * plain text, nothing else. `assistant` turns carrying a `toolCall` and `tool`
 * turns carrying a result are built inside a single request by the
 * orchestrator and are never returned to the browser: a client that could
 * supply a tool result could supply an invented price.
 */
export interface AIMessage {
  role: AIRole;
  content: string;
  /** Assistant turns only: the call the model made instead of prose. */
  toolCall?: AIToolCall;
  /** Tool turns only: which tool this answers. */
  toolName?: string;
  /**
   * Tool turns only: the call id this result answers (OpenAI wire format).
   * Gemini does not use this; DeepSeek does.
   */
  toolCallId?: string;
}

// ---------------------------------------------------------------------------
// Tool calling, described in provider-neutral terms
// ---------------------------------------------------------------------------

export interface AIToolParameter {
  type: 'string';
  description: string;
}

export interface AIToolDeclaration {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AIToolParameter>;
    required: string[];
  };
}

/** What the model asked for. Untrusted: every field is validated before use. */
export interface AIToolCall {
  /** Provider-assigned id, needed to pair tool results in OpenAI wire format. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AITextResponse {
  text: string;
}

export interface AIToolCallResponse {
  /** Prose the model produced alongside (or instead of) the call. */
  text: string | null;
  toolCall: AIToolCall | null;
}

export interface GenerateRequest {
  systemPrompt: string;
  messages: AIMessage[];
  /** Overrides the provider's own bound. Still bounded. */
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** Caller-side cancellation, e.g. the customer navigating away. */
  signal?: AbortSignal;
}

export interface ToolCallRequest extends GenerateRequest {
  tools: AIToolDeclaration[];
}

// ---------------------------------------------------------------------------
// The four read-only tools
// ---------------------------------------------------------------------------

/**
 * The tools the MODEL may call. All read-only.
 *
 * ---------------------------------------------------------------------------
 * THE WRITE TOOLS ARE DELIBERATELY NOT IN THIS LIST.
 *
 * `createBookingTool`, `cancelBookingTool` and `rescheduleBookingTool` exist in
 * tools.ts and call the existing transaction in lib/booking.ts — but they are
 * executed by the SERVER in response to an explicit customer tap, and are never
 * offered to the model.
 *
 * The batch requires that the assistant never books "because the customer said
 * something that sounded like yes". A declared write tool makes that a property
 * of the prompt: the model is asked to be careful, and one confidently misread
 * "go on then" is a real appointment in the diary. Undeclared, it is a property
 * of the architecture — there is no token the model can emit that reaches
 * `createBooking`, however it is argued with.
 *
 * What the model does instead is narrate: the tap authorises, the server
 * executes, and the outcome comes back as a tool turn for the model to put into
 * a sentence. It cannot invent the outcome either, because the result it is
 * narrating is the one the database returned.
 * ---------------------------------------------------------------------------
 */
export const TOOL_NAMES = [
  'get_business_info',
  'get_services',
  'get_staff',
  'check_availability',
  'get_booking',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolFailure =
  /** The model named a tool that does not exist. */
  | 'unknown_tool'
  /** The model's arguments did not validate. */
  | 'invalid_arguments'
  /** A validated argument did not resolve to a real row. */
  | 'not_found'
  /** The request was well formed but outside what the business allows. */
  | 'out_of_range'
  /** No manage token in the envelope — the customer has not proved ownership. */
  | 'no_booking_held'
  /** The data layer failed. */
  | 'unavailable';

/**
 * ---------------------------------------------------------------------------
 * TWO PROJECTIONS, ONE ENGINE CALL.
 *
 * `data` is what the MODEL sees: display times and therapist names, no ids.
 * `client` is what the BROWSER sees alongside the reply: the ISO instant and
 * the resolved staff id, so a tapped slot carries a stable handle instead of a
 * name that has to be resolved a second time at the worst possible moment.
 *
 * They come off the same call to the availability engine — there is no second
 * query and no second resolution. The orchestrator sends `data` back into the
 * conversation and hands `client` to the route; neither ever crosses over.
 * ---------------------------------------------------------------------------
 */
export type ToolResult =
  | { ok: true; tool: string; data: unknown; client?: ChatAttachment }
  | { ok: false; tool: string; error: ToolFailure; message: string };

/** A treatment, as a card the customer can tap rather than a line of prose. */
export interface ServiceCard {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  duration: string;
  priceCents: number;
  price: string;
}

export interface ServicesAttachment {
  kind: 'services';
  services: ServiceCard[];
}

export interface AvailabilityOption {
  /**
   * The instant, not the label. A client holding only 'HH:MM' has to rebuild an
   * instant from a wall clock and a timezone, which is the naive-local-time
   * mistake that already shipped once in the walk-in form (v2 §12).
   */
  startsAt: string;
  /** 'HH:MM' in the business timezone — what the button says. */
  time: string;
  staffName: string;
  /** Resolved server-side at check time. Sent on only when `staffPinned`. */
  staffId: string;
}

export interface AvailabilityAttachment {
  kind: 'availability';
  serviceId: string;
  serviceName: string;
  /** Carried so the confirmation card need not look the price up again. */
  servicePrice: string;
  date: string;
  timezone: string;
  /**
   * Did the customer actually ask for this therapist?
   *
   * With no request, the resolved id is simply whoever sorted first among the
   * free. Pinning that would lock an indifferent customer to one therapist and
   * produce a 409 where `staff_id: null` would have booked someone else. The
   * client sends the id on only when this is true — the same "Anyone" rule
   * `/book` already follows.
   */
  staffPinned: boolean;
  options: AvailabilityOption[];
}

/**
 * A booking, as the MODEL is allowed to see it.
 *
 * ---------------------------------------------------------------------------
 * NO NAME, NO PHONE, NO TOKEN — and this is the first tool that could have
 * leaked them.
 *
 * Batch A's redaction covers customer-authored turns only. That is sound while
 * every tool result is assembled field by field out of business data, because
 * there is then nothing personal in the assembly to leak. `get_booking` reads a
 * row that joins `customers`, which ends that guarantee — `AppointmentDetail`
 * carries `customer_name`, `customer_phone`, `customer_email` and
 * `manage_token`, and returning it whole would put all four into a third
 * party's logs.
 *
 * So this type exists to make the safe subset the only thing that can be built.
 * It is what the model needs to DISCUSS an appointment and nothing else; the
 * client already holds the name, the phone and the token, and renders them
 * itself. `tests/ai/privacy.test.ts` asserts this directly rather than trusting
 * the reviewer of the next change to notice.
 * ---------------------------------------------------------------------------
 */
export interface BookingView {
  service: string;
  date: string;
  time: string;
  with: string;
  status: string;
  /** Can the customer still change it themselves, or is it inside notice? */
  can_change: boolean;
}

/** A booking as the CLIENT renders it — same row, the customer's own details. */
export interface BookingCard {
  appointmentId: string;
  serviceName: string;
  date: string;
  time: string;
  startsAt: string;
  staffName: string;
  status: string;
  price: string;
  manageUrl: string;
  canChange: boolean;
}

export interface BookingAttachment {
  kind: 'booking';
  booking: BookingCard;
  /** True the moment the transaction returned success, never before. */
  justBooked: boolean;
}

/**
 * The slot went while the customer was confirming.
 *
 * Carries alternatives in the SAME shape as `AvailabilityAttachment.options`,
 * which is the whole point of the type existing. See the note in tools.ts.
 */
export interface ConflictAttachment {
  kind: 'conflict';
  what: 'book' | 'reschedule';
  serviceId: string;
  serviceName: string;
  servicePrice: string;
  date: string;
  timezone: string;
  staffPinned: boolean;
  options: AvailabilityOption[];
}

export type ChatAttachment =
  | ServicesAttachment
  | AvailabilityAttachment
  | BookingAttachment
  | ConflictAttachment;

/**
 * One day of opening hours, as the site itself derives them: the union of every
 * active therapist's working hours. Absent days are `closed`, stated rather
 * than implied, so the model cannot read silence as "open".
 */
export interface OpeningHoursDay {
  day: string;
  closed: boolean;
  opens?: string;
  closes?: string;
}

export interface BusinessInfo {
  name: string;
  address: string | null;
  phone: string;
  website: string;
  opening_hours: OpeningHoursDay[];
  timezone: string;
}

/**
 * A treatment as the assistant may describe it.
 *
 * `id` is here because `check_availability` needs it. No other tool result
 * carries an internal id — see the note on StaffInfo.
 */
export interface ServiceInfo {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  duration: string;
  price_cents: number;
  price: string;
  active: true;
  /** Whether a room or chair has to be free as well as the therapist (§6). */
  requires_resource: boolean;
}

/**
 * A therapist, as the model is allowed to know her.
 *
 * Name, whether she is working, and what she does. No id (a name is enough to
 * ask about her availability, and `check_availability` resolves it server-side),
 * and never her phone, email, notes or anything from the auth tables.
 */
export interface StaffInfo {
  name: string;
  active: true;
  services: string[];
}

export interface AvailabilitySlot {
  /** 'HH:MM' in the business timezone. Never a browser-local time. */
  time: string;
  /** Who it would be with. A name, not an id. Present in the client projection, omitted from the model projection. */
  with?: string;
}

export interface AvailabilityInfo {
  date: string;
  service: string;
  timezone?: string;
  slots: AvailabilitySlot[];
}

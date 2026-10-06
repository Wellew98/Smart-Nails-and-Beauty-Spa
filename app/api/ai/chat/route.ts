import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import {
  BUSY_MESSAGE,
  FALLBACK_MESSAGE,
  describeAction,
  isWriteAction,
  limitsFrom,
  orchestrate,
  performWrite,
  type ClientAction,
} from '@/lib/ai/orchestrator';
import { getProvider } from '@/lib/ai/provider';
import { clientIp, consume } from '@/lib/ai/rate-limit';
import { pruneOccasionally, recordTurns } from '@/lib/ai/transcript';
import type { ToolContext } from '@/lib/ai/tools';
import { getBusiness } from '@/lib/public-data';
import type { AIMessage, ChatAttachment } from '@/lib/ai/types';

/**
 * POST /api/ai/chat — the assistant's only public surface.
 *
 * ---------------------------------------------------------------------------
 * THIS ROUTE CONTAINS NO BUSINESS LOGIC.
 *
 * It validates, rate limits, and hands off. Every fact comes from the tools and
 * every tool reads the same rows the site renders.
 *
 * WRITES ARE NOT REACHABLE BY THE MODEL. A booking, cancellation or move
 * happens only when the customer taps a confirmation, and it happens HERE,
 * before the model is consulted — see `performWrite`. The model is handed the
 * result and asked to put it into a sentence. So the assistant cannot book
 * because a message sounded like a yes, cannot book something other than what
 * was confirmed, and cannot announce a success the transaction did not return.
 *
 * NAME, PHONE AND THE MANAGE TOKEN ARRIVE IN THE ENVELOPE, never inside
 * `messages`. They go straight to lib/booking.ts and are never added to the
 * conversation, so no redaction rule stands between a customer's phone number
 * and a third party's logs — the number is simply never in that request.
 *
 * ORDER MATTERS. Rate limiting happens before the conversation is even parsed,
 * so a visitor sending a megabyte of nonsense is refused on the cheapest
 * possible path rather than after validating it. It is also why a REFUSED TURN
 * IS NEVER RECORDED: the transcript write sits past every early return, so
 * abuse costs a rate-limit upsert and not a transcript.
 *
 * THE CONVERSATION IS KEPT for thirty days, so the owner can see what people
 * ask — see lib/ai/transcript.ts and migration 0007. That store holds the two
 * sides of the conversation and nothing else; the envelope rule above is what
 * keeps the phone number out of it, structurally rather than by redaction.
 * ---------------------------------------------------------------------------
 */

export const dynamic = 'force-dynamic';

/**
 * A turn is up to `AI_MAX_TOOL_CALLS` provider round trips plus a Postgres
 * availability query. Measured locally, everything EXCEPT the model is a median
 * of 27ms; the model is the entire rest and could not be measured here, because
 * outbound network in the build container reaches Supabase and not Google.
 *
 * 60 is comfortably inside the platform ceiling rather than at it: with fluid
 * compute (on by default) Vercel's current limits are 300s default and 300s
 * maximum on Hobby, 800s on Pro. The often-quoted "Hobby is capped at 60s" is
 * the pre-fluid-compute figure. So this is a deliberate cap BELOW the platform
 * default — a runaway turn dies in a minute instead of five.
 *
 * What actually bounds a turn is `AI_TURN_BUDGET_MS` (25s), which the
 * orchestrator enforces across every provider call. This is the backstop, and
 * the gap between the two is the headroom. Batch C measures a real turn against
 * the live provider; if that lands near the budget, the budget moves first and
 * this is re-checked against it.
 */
export const maxDuration = 60;

const limits = limitsFrom();

const messageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(limits.maxMessageLength),
});

/**
 * Structured actions are validated as strictly as anything the model produces,
 * and then checked against the database in `describeAction`. A payload from
 * the browser has no more authority than a payload from the model.
 */
const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('service'), serviceId: z.uuid() }),
  z.strictObject({
    kind: z.literal('slot'),
    serviceId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    staffId: z.union([z.uuid(), z.null()]).optional(),
  }),
  /**
   * The confirmation tap.
   *
   * Name and phone arrive HERE and nowhere else — never inside `messages`, so
   * they are structurally incapable of reaching the model. The route hands them
   * straight to `createBooking` and they are gone. That is the difference
   * between a redaction rule, which the next change can quietly break, and an
   * architecture, which it cannot.
   */
  z.strictObject({
    kind: z.literal('confirm_booking'),
    serviceId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    staffId: z.union([z.uuid(), z.null()]).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1).max(40),
    email: z.union([z.email(), z.literal(''), z.null()]).optional(),
    // Minted client-side, once per confirmation. Same bounds as /api/bookings.
    idempotencyKey: z.string().min(8).max(200),
  }),
  z.strictObject({ kind: z.literal('confirm_cancel') }),
  z.strictObject({
    kind: z.literal('confirm_reschedule'),
    startsAt: z.iso.datetime({ offset: true }),
    staffId: z.union([z.uuid(), z.null()]).optional(),
  }),
]);

const bodySchema = z.strictObject({
  messages: z.array(messageSchema).min(1).max(limits.maxMessages),
  action: actionSchema.optional(),
  /**
   * The customer's manage token, if they arrived from their booking link.
   *
   * In the envelope, never in `messages`. It is a working credential for one
   * appointment, and a credential in the conversation is a credential in a
   * third party's logs. `ToolContext` carries it to the tools that need it.
   */
  manageToken: z.string().min(10).max(200).optional(),
  /**
   * Which conversation this turn belongs to, minted by the browser once per
   * chat window.
   *
   * Optional on purpose: a client that does not send one is simply not
   * recorded, so a cached older bundle keeps working and the assistant never
   * depends on the transcript store being reachable.
   */
  conversationId: z.uuid().optional(),
});

/** Never a stack, never a provider string, never an id. */
function reply(message: string, status = 200, degraded = true) {
  return NextResponse.json(
    { reply: message, attachments: [], degraded, bookUrl: '/book' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  // 1. Rate limit first — before parsing, so abuse costs the least possible.
  const verdict = await consume(clientIp(request.headers));
  if (!verdict.allowed) {
    console.warn('[ai] rate limited', { reason: verdict.reason });
    // A friendly body, not a bare 429. The customer gets a way forward.
    return reply(verdict.reason === 'unavailable' ? FALLBACK_MESSAGE : BUSY_MESSAGE, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply('I did not catch that. Try sending it again.', 400);
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    // The reason stays in the log. Handing a customer a validation trace tells
    // them the shape of the endpoint and tells a real customer nothing.
    console.warn('[ai] rejected request', { issue: parsed.error.issues[0]?.code });
    return reply('I did not catch that. Try sending it again.', 400);
  }

  const provider = getProvider();
  // No key, no model, or a key in a NEXT_PUBLIC_ variable. Normal before the
  // AI variables are set, and never an error the customer should see.
  if (!provider) return reply(FALLBACK_MESSAGE, 200);

  const business = await getBusiness();
  if (!business) return reply(FALLBACK_MESSAGE, 200);

  const messages: AIMessage[] = parsed.data.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const context: ToolContext = {
    businessId: business.id,
    manageToken: parsed.data.manageToken ?? null,
  };

  // Attachments produced by a write, which must survive the model turn that
  // narrates it: the customer's booking card has to appear whatever the model
  // then says, and must not depend on it saying anything sensible.
  const writeAttachments: ChatAttachment[] = [];
  /**
   * The appointment a write on this turn touched, carried to the transcript so
   * a booked conversation can be deleted along with the customer's details.
   * Never added to `messages` — the model's view of the write is `outcome.turn`.
   */
  let writeAppointmentId: string | null = null;

  if (parsed.data.action) {
    const action = parsed.data.action as ClientAction;

    if (isWriteAction(action)) {
      // THE WRITE HAPPENS HERE, before the model is consulted at all. The tap
      // authorises it; the model is only told what the database did. It cannot
      // decline to book, cannot book something else, and cannot report a
      // success that did not happen.
      const outcome = await performWrite(action, context);
      if (!outcome) {
        console.warn('[ai] rejected write action', { kind: action.kind });
        return reply('I could not do that. Please use the booking page.', 400, true);
      }
      messages.push({ role: 'user', content: outcome.turn });
      if (outcome.attachment) writeAttachments.push(outcome.attachment);
      writeAppointmentId = outcome.appointmentId ?? null;
    } else {
      // A browse tap becomes a customer turn only after the database agrees it
      // was a real offer. A rejected action falls through to the conversation
      // as it stands rather than failing the request.
      const described = await describeAction(action, context);
      if (!described) {
        console.warn('[ai] rejected action', { kind: action.kind });
        return reply('That option is no longer available. Ask me what else is free.', 200, false);
      }
      messages.push({ role: 'user', content: described });
    }
  }

  try {
    const result = await orchestrate({
      messages,
      businessId: business.id,
      provider,
      limits,
      manageToken: context.manageToken,
    });

    // The write's own attachment wins over anything the model's turn produced
    // for the same slot in the UI. What was written is not up for revision.
    const attachments = [
      ...writeAttachments,
      ...result.attachments.filter(
        (item) => !writeAttachments.some((written) => written.kind === item.kind),
      ),
    ];
    // When the customer already picked a treatment, don't show the full menu
    // again — the model sometimes calls get_services on follow-up turns and the
    // card stacks with availability slots.
    const pickedService = parsed.data.action?.kind === 'service';
    const filtered = pickedService
      ? attachments.filter((a) => a.kind !== 'services')
      : attachments;

    /**
     * Record the turn — AFTER the response, and never able to delay or fail it.
     *
     * WHAT IS RECORDED IS WHAT THE TWO OF THEM SAID, and nothing else. The
     * customer's own last message and the assistant's reply. Not the synthetic
     * turns pushed into `messages` above: `[The booking was written to the
     * database...]` is an instruction to the model, not a thing anybody said,
     * and it would make a transcript unreadable while telling the owner
     * nothing the `booked` flag does not.
     *
     * Only the NEW pair is written. The browser re-sends the whole history on
     * every turn because the model needs it; storing it again each time would
     * rewrite the transcript on every message.
     */
    const record = async () => {
      const spoken = parsed.data.messages[parsed.data.messages.length - 1];
      await recordTurns({
        conversationId: parsed.data.conversationId,
        businessId: business.id,
        appointmentId: writeAppointmentId,
        booked: filtered.some((item) => item.kind === 'booking' && item.justBooked),
        turns: [
          ...(spoken?.role === 'user' ? [{ role: 'user' as const, content: spoken.content }] : []),
          { role: 'assistant' as const, content: result.reply },
        ],
      });
      await pruneOccasionally();
    };

    /**
     * `after()` ITSELF THROWS when there is no request scope around it, and
     * that throw would land in the catch below — turning a turn that worked
     * into the fallback message, after the model had already been paid for and
     * a booking possibly written. The rule this module lives by is that
     * recording never costs a customer an answer, and an unguarded `after` is
     * precisely the thing that would break it.
     *
     * Outside a request scope there is also nothing to defer to, so the work
     * runs inline. That path is the test harness today; awaiting it there is
     * what makes the assertions deterministic, and it costs a live request
     * nothing because a live request never takes it.
     */
    try {
      after(record);
    } catch {
      await record();
    }

    return NextResponse.json(
      { ...result, attachments: filtered, bookUrl: '/book' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[ai] chat failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return reply(FALLBACK_MESSAGE, 200);
  }
}

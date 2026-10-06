import 'server-only';
import { query, queryOne, withTransaction } from '../db';
import type { EnvLike } from './types';

/**
 * Conversation transcripts — written by the chat route, read by the owner.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THIS MODULE LIVES BY: RECORDING MUST NEVER COST A CUSTOMER AN ANSWER.
 *
 * Everything here is called after the reply has been produced, and every path
 * swallows its own failure. A customer asking about a pedicure does not care
 * whether the owner's notes worked, and the assistant going down because a
 * write to a reporting table failed would be an absurd trade.
 *
 * That is also why the route calls this inside `after()` — the response is
 * already on its way when this runs.
 *
 * WHAT GETS STORED is only the customer's own words and the assistant's reply.
 * See the header of supabase/migrations/0007_ai_conversations.sql for what is
 * deliberately absent and why it is absent structurally rather than by policy.
 * ---------------------------------------------------------------------------
 */

/**
 * How long a transcript is kept.
 *
 * Thirty days is long enough for the owner to read a month back and spot what
 * people keep asking for, and short enough that the store never becomes a
 * standing archive of things customers typed about themselves. It is stated in
 * the privacy notice, so CHANGING IT MEANS CHANGING THAT PAGE TOO.
 */
export const DEFAULT_RETENTION_DAYS = 30;

export function retentionDays(env: EnvLike = process.env): number {
  const parsed = Number(env.AI_TRANSCRIPT_RETENTION_DAYS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

/**
 * A backstop, not a limit anyone should reach.
 *
 * The user side is already bounded by `AI_MAX_MESSAGE_LENGTH` before it gets
 * here. The assistant side is model output, which is bounded by the provider
 * and by nothing in this codebase — so it is bounded here.
 */
const MAX_STORED_CONTENT = 4000;

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RecordOptions {
  /** The browser's per-window id. Absent on an older client — then nothing is stored. */
  conversationId: string | null | undefined;
  businessId: string;
  turns: TranscriptTurn[];
  /**
   * The appointment a write on this turn touched, if any.
   *
   * Resolved to a customer here rather than in the route, which has no business
   * knowing the shape of `appointments`. Setting it is what brings the
   * transcript inside the reach of §9.4 erasure.
   */
  appointmentId?: string | null;
  /** Sticky: a conversation that ever booked stays booked in the list. */
  booked?: boolean;
}

/**
 * Who the appointment belongs to.
 *
 * A failure here is not a reason to lose the transcript — an unlinked
 * conversation is still worth reading, and it is pruned by age regardless. So
 * this returns null and the write goes ahead without the link.
 */
async function customerFor(appointmentId: string): Promise<string | null> {
  try {
    const row = await queryOne<{ customer_id: string }>(
      'select customer_id from appointments where id = $1',
      [appointmentId],
    );
    return row?.customer_id ?? null;
  } catch {
    return null;
  }
}

function tidy(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > MAX_STORED_CONTENT ? trimmed.slice(0, MAX_STORED_CONTENT) : trimmed;
}

/**
 * Append one turn's worth of messages to a conversation, creating it if this is
 * the first turn.
 *
 * ONLY THE NEW MESSAGES ARE WRITTEN, never the history the browser re-sends on
 * every request. The client posts the whole conversation each turn because the
 * model needs it; storing that would rewrite the entire transcript N times and
 * grow quadratically for no gain.
 */
export async function recordTurns(options: RecordOptions): Promise<void> {
  const { conversationId, businessId, appointmentId = null, booked = false } = options;
  if (!conversationId) return;

  const turns = options.turns
    .map((turn) => ({ role: turn.role, content: tidy(turn.content) }))
    .filter((turn) => turn.content.length > 0);
  if (turns.length === 0) return;

  try {
    const customerId = appointmentId ? await customerFor(appointmentId) : null;

    await withTransaction(async (client) => {
      // The `where` on the conflict clause is what stops a visitor who guessed
      // another business's conversation id from appending to it. No row comes
      // back, and the messages are not written.
      const conversation = await client.query(
        `insert into ai_conversations (id, business_id, customer_id, message_count, booked)
              values ($1, $2, $3, $4, $5)
         on conflict (id) do update
            set last_message_at = now(),
                message_count   = ai_conversations.message_count + $4,
                -- Sticky in both directions: a booking made on turn six does not
                -- un-book on turn seven, and the customer link is set once.
                booked          = ai_conversations.booked or excluded.booked,
                customer_id     = coalesce(ai_conversations.customer_id, excluded.customer_id)
          where ai_conversations.business_id = excluded.business_id
      returning id`,
        [conversationId, businessId, customerId, turns.length, booked],
      );

      if (conversation.rowCount === 0) return;

      await client.query(
        `insert into ai_messages (conversation_id, role, content)
         select $1, r.role, r.content
           from unnest($2::text[], $3::text[]) as r(role, content)`,
        [conversationId, turns.map((t) => t.role), turns.map((t) => t.content)],
      );
    });
  } catch (error) {
    // Operational only, and never the message. A transcript that failed to
    // save must not turn into the content of a log line instead.
    console.error('[ai] transcript write failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

/**
 * Drop conversations past the retention window.
 *
 * One in fifty turns, for the same reason the rate limiter prunes that way: a
 * delete on the hot path of every message would cost every customer a little
 * so that nobody gains anything. `ai_messages` follows by cascade.
 *
 * THIS IS THE ONLY THING ENFORCING THE RETENTION PROMISE. There is no cron in
 * this project and no scheduled function; if this stops being called, the
 * privacy notice quietly becomes untrue. A deployment that goes a month
 * without a single chat keeps its old transcripts a little longer — that is
 * the accepted cost of not adding a scheduler for one delete.
 */
export async function pruneOccasionally(env: EnvLike = process.env): Promise<void> {
  if (Math.random() > 0.02) return;
  try {
    await query(
      `delete from ai_conversations
             where last_message_at < now() - ($1 || ' days')::interval`,
      [String(retentionDays(env))],
    );
  } catch {
    // Housekeeping. It runs again in another fifty turns.
  }
}

/**
 * Erasure lives in `forgetCustomer` (lib/booking.ts) and NOT here, deliberately.
 * It has to happen inside that function's transaction, alongside the wipe of
 * the customers row — a helper on this side would be a second transaction and
 * therefore a window in which the person is erased but the conversation naming
 * them is not.
 */

export interface ConversationSummary {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  booked: boolean;
  turns: TranscriptTurn[];
}

/**
 * The owner's view: the most recent conversations, each with its messages.
 *
 * Two queries rather than a join, because a join would repeat every
 * conversation row once per message and the assembly is a `Map` either way.
 */
export async function recentConversations(
  businessId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const conversations = await query<{
    id: string;
    started_at: Date;
    last_message_at: Date;
    message_count: number;
    booked: boolean;
  }>(
    `select id, started_at, last_message_at, message_count, booked
       from ai_conversations
      where business_id = $1
      order by last_message_at desc
      limit $2`,
    [businessId, limit],
  );

  if (conversations.length === 0) return [];

  const messages = await query<{ conversation_id: string; role: 'user' | 'assistant'; content: string }>(
    `select conversation_id, role, content
       from ai_messages
      where conversation_id = any($1::uuid[])
      order by conversation_id, id`,
    [conversations.map((row) => row.id)],
  );

  const byConversation = new Map<string, TranscriptTurn[]>();
  for (const message of messages) {
    const existing = byConversation.get(message.conversation_id);
    const turn = { role: message.role, content: message.content };
    if (existing) existing.push(turn);
    else byConversation.set(message.conversation_id, [turn]);
  }

  return conversations.map((row) => ({
    id: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    messageCount: Number(row.message_count),
    booked: row.booked,
    turns: byConversation.get(row.id) ?? [],
  }));
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/ai/chat/route';
import { performWrite } from '@/lib/ai/orchestrator';
import { recentConversations, recordTurns } from '@/lib/ai/transcript';
import { getAvailableSlots } from '@/lib/availability';
import { forgetCustomer } from '@/lib/booking';
import { query } from '@/lib/db';
import { IDS, resetDatabase } from '../helpers/fixtures';

/**
 * Conversation transcripts — spec §9 applied to a store that did not used to
 * exist.
 *
 * ---------------------------------------------------------------------------
 * THE THREE CLAIMS WORTH PINNING, AND WHY THEY ARE THESE THREE.
 *
 *  1. WHAT IS STORED IS ONLY THE CONVERSATION. The route pushes synthetic turns
 *     into `messages` to tell the model what a write did, and the browser
 *     re-sends the entire history on every request. Either one leaking into the
 *     transcript would be invisible in the UI and obvious in Admin a week later.
 *
 *  2. NO NAME AND NO PHONE NUMBER, EVER. This is the property the whole
 *     envelope design exists to give, and storing transcripts is exactly the
 *     change that could quietly take it away. It is asserted here against the
 *     REAL ROUTE with a real booking written to Postgres, not against a helper.
 *
 *  3. ERASURE REACHES IT. "Delete my details" that leaves behind a conversation
 *     in which the customer described herself has not deleted her details.
 *
 * Everything else in this file is retention and bookkeeping.
 * ---------------------------------------------------------------------------
 */

const ORIGINAL = { ...process.env };

beforeEach(async () => {
  await resetDatabase();
  await query('truncate ai_rate_limit');
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

const CONVERSATION = '11111111-1111-4111-8111-000000000001';

async function transcriptOf(id: string) {
  return query<{ role: string; content: string }>(
    'select role, content from ai_messages where conversation_id = $1 order by id',
    [id],
  );
}

// ---------------------------------------------------------------------------
// 1. Only the conversation, and only the new part of it
// ---------------------------------------------------------------------------

describe('what a transcript contains', () => {
  it('keeps the turns in the order they were said', async () => {
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [
        { role: 'user', content: 'Do you do gel?' },
        { role: 'assistant', content: 'We do.' },
      ],
    });

    expect(await transcriptOf(CONVERSATION)).toEqual([
      { role: 'user', content: 'Do you do gel?' },
      { role: 'assistant', content: 'We do.' },
    ]);
  });

  it('appends across turns instead of rewriting the history the browser re-sends', async () => {
    for (const [question, answer] of [
      ['Do you do gel?', 'We do.'],
      ['How much?', 'R250.'],
    ]) {
      await recordTurns({
        conversationId: CONVERSATION,
        businessId: IDS.business,
        turns: [
          { role: 'user', content: question },
          { role: 'assistant', content: answer },
        ],
      });
    }

    // Four rows, not six — the second turn stored the second exchange and not
    // the first one over again.
    const stored = await transcriptOf(CONVERSATION);
    expect(stored).toHaveLength(4);
    expect(stored.map((row) => row.content)).toEqual([
      'Do you do gel?',
      'We do.',
      'How much?',
      'R250.',
    ]);

    const [conversation] = await query<{ message_count: number; started_at: Date; last_message_at: Date }>(
      'select message_count, started_at, last_message_at from ai_conversations where id = $1',
      [CONVERSATION],
    );
    expect(Number(conversation.message_count)).toBe(4);
    // Retention is measured from the last message, so a resumed conversation
    // must move that and not `started_at`.
    expect(conversation.last_message_at.getTime()).toBeGreaterThanOrEqual(
      conversation.started_at.getTime(),
    );
  });

  it('stores nothing at all when the client sent no conversation id', async () => {
    await recordTurns({
      conversationId: undefined,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'hello' }],
    });

    const rows = await query('select 1 from ai_conversations');
    expect(rows).toHaveLength(0);
  });

  it('caps a single message rather than trusting the model to be brief', async () => {
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [{ role: 'assistant', content: 'x'.repeat(10_000) }],
    });

    const [stored] = await transcriptOf(CONVERSATION);
    expect(stored.content.length).toBe(4000);
  });

  it('refuses to append to a conversation belonging to another business', async () => {
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'mine' }],
    });

    // A visitor who guessed the id, arriving under a different business.
    const other = '00000000-0000-4000-8000-0000000000b2';
    await query(
      `insert into businesses (id, name, slug, phone) values ($1, 'Other', 'other', '+27110000000')`,
      [other],
    );
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: other,
      turns: [{ role: 'user', content: 'injected' }],
    });

    const stored = await transcriptOf(CONVERSATION);
    expect(stored.map((row) => row.content)).toEqual(['mine']);
  });

  it('never throws, whatever the database does', async () => {
    // A conversation id that is not a UUID reaches Postgres and is rejected
    // there. A customer's answer must not depend on this succeeding.
    await expect(
      recordTurns({
        conversationId: 'not-a-uuid',
        businessId: IDS.business,
        turns: [{ role: 'user', content: 'hello' }],
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. The whole point of the envelope, asserted against the real route
// ---------------------------------------------------------------------------

/**
 * A provider that answers anything with one sentence, wired in through the
 * environment exactly as a deployment wires the real one.
 *
 * The route builds the transcript from data it holds at the moment it replies,
 * so nothing short of driving the route proves what ends up in the table.
 */
function stubProvider(reply: string) {
  process.env.AI_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'sk-test-key-not-real';
  process.env.AI_MODEL = 'deepseek-chat';

  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function chat(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '41.20.9.1' },
      body: JSON.stringify(body),
    }),
  );
}

describe('booking through the chat, and what the transcript then holds', () => {
  const NAME = 'Thandi Mahlangu';
  const PHONE = '082 555 0101';

  it('records the conversation and neither the name nor the number', async () => {
    const restore = stubProvider('You are booked.');
    try {
      const slots = await getAvailableSlots({
        businessId: IDS.business,
        serviceId: IDS.service.gelManicure,
        date: (await import('../helpers/fixtures')).nextWorkingDate(),
      });

      const response = await chat({
        conversationId: CONVERSATION,
        messages: [{ role: 'user', content: 'Yes, please book that.' }],
        action: {
          kind: 'confirm_booking',
          serviceId: IDS.service.gelManicure,
          startsAt: slots[0].startsAt.toISOString(),
          staffId: null,
          name: NAME,
          phone: PHONE,
          idempotencyKey: 'confirmation-key-0001',
        },
      });
      expect(response.status).toBe(200);

      // The booking really happened — otherwise this asserts the absence of a
      // phone number in a transcript of nothing.
      const [appointment] = await query<{ id: string }>("select id from appointments where status <> 'cancelled'");
      expect(appointment).toBeDefined();

      const stored = await transcriptOf(CONVERSATION);
      const everything = JSON.stringify(stored);

      expect(everything).not.toContain(NAME);
      expect(everything).not.toContain(PHONE);
      expect(everything).not.toContain('+27825550101');
      // Nor the instruction the route wrote for the model to narrate. That is
      // machinery, and it is not a thing anybody said.
      expect(everything).not.toContain('written to the database');

      expect(stored).toEqual([
        { role: 'user', content: 'Yes, please book that.' },
        { role: 'assistant', content: 'You are booked.' },
      ]);
    } finally {
      restore();
    }
  });

  it('marks the conversation booked and links it to the customer', async () => {
    const restore = stubProvider('You are booked.');
    try {
      const { nextWorkingDate } = await import('../helpers/fixtures');
      const slots = await getAvailableSlots({
        businessId: IDS.business,
        serviceId: IDS.service.gelManicure,
        date: nextWorkingDate(),
      });

      await chat({
        conversationId: CONVERSATION,
        messages: [{ role: 'user', content: 'Yes, please book that.' }],
        action: {
          kind: 'confirm_booking',
          serviceId: IDS.service.gelManicure,
          startsAt: slots[0].startsAt.toISOString(),
          staffId: null,
          name: NAME,
          phone: PHONE,
          idempotencyKey: 'confirmation-key-0002',
        },
      });

      const [conversation] = await query<{ booked: boolean; customer_id: string | null }>(
        'select booked, customer_id from ai_conversations where id = $1',
        [CONVERSATION],
      );
      expect(conversation.booked).toBe(true);
      expect(conversation.customer_id).not.toBeNull();
    } finally {
      restore();
    }
  });

  it('records nothing for a refused request', async () => {
    process.env.AI_RATE_LIMIT_BURST = '1';
    const restore = stubProvider('Hello.');
    try {
      await chat({ conversationId: CONVERSATION, messages: [{ role: 'user', content: 'hi' }] });
      const refused = await chat({
        conversationId: CONVERSATION,
        messages: [{ role: 'user', content: 'hi again' }],
      });
      expect(refused.status).toBe(429);

      // The refused turn is not in the transcript. Abuse costs a counter, not a
      // growing table of somebody's flood.
      const stored = await transcriptOf(CONVERSATION);
      expect(stored.map((row) => row.content)).not.toContain('hi again');
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Erasure, and retention
// ---------------------------------------------------------------------------

describe('§9.4 erasure reaches the transcript', () => {
  async function bookThroughChat(conversationId: string) {
    const { nextWorkingDate } = await import('../helpers/fixtures');
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date: nextWorkingDate(),
    });

    const outcome = await performWrite(
      {
        kind: 'confirm_booking',
        serviceId: IDS.service.gelManicure,
        startsAt: slots[0].startsAt.toISOString(),
        staffId: null,
        name: 'Thandi Mahlangu',
        phone: '082 555 0101',
        idempotencyKey: `key-${conversationId}`,
      },
      { businessId: IDS.business, manageToken: null },
    );

    await recordTurns({
      conversationId,
      businessId: IDS.business,
      appointmentId: outcome!.appointmentId,
      booked: true,
      turns: [
        { role: 'user', content: 'I have very sensitive skin, please make a note' },
        { role: 'assistant', content: 'Booked.' },
      ],
    });

    const [appointment] = await query<{ customer_id: string }>(
      "select customer_id from appointments where status <> 'cancelled' limit 1",
    );
    return appointment.customer_id;
  }

  it('deletes the conversation along with the details, messages and all', async () => {
    const customerId = await bookThroughChat(CONVERSATION);
    expect(await transcriptOf(CONVERSATION)).toHaveLength(2);

    await forgetCustomer({ customerId });

    expect(await transcriptOf(CONVERSATION)).toHaveLength(0);
    const conversations = await query('select 1 from ai_conversations where id = $1', [CONVERSATION]);
    expect(conversations).toHaveLength(0);
  });

  it('leaves other people’s conversations alone', async () => {
    const other = '22222222-2222-4222-8222-000000000002';
    await recordTurns({
      conversationId: other,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'just browsing' }],
    });

    const customerId = await bookThroughChat(CONVERSATION);
    await forgetCustomer({ customerId });

    // Never booked, so never linked, so untouched. It ages out on its own.
    expect(await transcriptOf(other)).toHaveLength(1);
  });
});

describe('retention', () => {
  it('drops conversations past the window and keeps the rest', async () => {
    const { pruneOccasionally } = await import('@/lib/ai/transcript');

    const old = '33333333-3333-4333-8333-000000000003';
    for (const id of [old, CONVERSATION]) {
      await recordTurns({
        conversationId: id,
        businessId: IDS.business,
        turns: [{ role: 'user', content: 'hello' }],
      });
    }
    await query(`update ai_conversations set last_message_at = now() - interval '31 days' where id = $1`, [old]);

    // The prune is sampled at 2% on the hot path, so it is driven here until it
    // runs rather than asserted on one call and hoped for.
    for (let attempt = 0; attempt < 500; attempt++) await pruneOccasionally();

    const surviving = await query<{ id: string }>('select id from ai_conversations');
    expect(surviving.map((row) => row.id)).toEqual([CONVERSATION]);
    // The messages went with it, by cascade.
    expect(await transcriptOf(old)).toHaveLength(0);
  });

  it('honours a shorter window from the environment', async () => {
    const { pruneOccasionally } = await import('@/lib/ai/transcript');

    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'hello' }],
    });
    await query(`update ai_conversations set last_message_at = now() - interval '3 days'`);

    for (let attempt = 0; attempt < 500; attempt++) {
      await pruneOccasionally({ AI_TRANSCRIPT_RETENTION_DAYS: '1' });
    }

    expect(await query('select 1 from ai_conversations')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The owner's screen
// ---------------------------------------------------------------------------

describe('what the owner sees', () => {
  it('lists the most recent conversation first, with its turns', async () => {
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'first' }],
    });
    const newer = '44444444-4444-4444-8444-000000000004';
    await recordTurns({
      conversationId: newer,
      businessId: IDS.business,
      turns: [
        { role: 'user', content: 'Do you do acrylics?' },
        { role: 'assistant', content: 'Not at the moment.' },
      ],
    });

    const listed = await recentConversations(IDS.business);

    expect(listed.map((item) => item.id)).toEqual([newer, CONVERSATION]);
    expect(listed[0].messageCount).toBe(2);
    expect(listed[0].booked).toBe(false);
    expect(listed[0].turns.map((turn) => turn.content)).toEqual([
      'Do you do acrylics?',
      'Not at the moment.',
    ]);
  });

  it('shows nothing from another business', async () => {
    await recordTurns({
      conversationId: CONVERSATION,
      businessId: IDS.business,
      turns: [{ role: 'user', content: 'ours' }],
    });

    const other = '00000000-0000-4000-8000-0000000000b3';
    await query(
      `insert into businesses (id, name, slug, phone) values ($1, 'Other', 'other-2', '+27110000000')`,
      [other],
    );

    expect(await recentConversations(other)).toEqual([]);
  });
});

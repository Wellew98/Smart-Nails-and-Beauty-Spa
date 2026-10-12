import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wa/outbox — the salon-PC sender polls this for pending alerts.
 * POST /api/wa/outbox — the sender acks each item sent (or failed).
 *
 * Guarded by WA_SENDER_SECRET, never by session: the sender has no browser.
 * Store-and-forward means a booking queues even while the PC is off, and the
 * sender drains the backlog when it comes back. Max 10 per poll so one slow
 * send never blocks the loop.
 */

const MAX_ATTEMPTS = 20;

function authorized(request: Request): boolean {
  const secret = process.env.WA_SENDER_SECRET;
  if (!secret) return false;
  const given =
    request.headers.get('x-wa-secret') ?? new URL(request.url).searchParams.get('secret');
  return given === secret;
}

interface OutboxRow {
  id: string;
  to_phone: string;
  body: string;
  attempts: number;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await query<OutboxRow>(
    `select id, to_phone, body, attempts from wa_outbox
     where status = 'pending' and attempts < $1
     order by created_at asc limit 10`,
    [MAX_ATTEMPTS],
  );
  return NextResponse.json({ items: rows });
}

const ackSchema = z.object({
  id: z.uuid(),
  ok: z.boolean(),
  error: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = ackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { id, ok, error } = parsed.data;
  if (ok) {
    await query(`update wa_outbox set status = 'sent', sent_at = now() where id = $1`, [id]);
  } else {
    await query(
      `update wa_outbox
       set attempts = attempts + 1, last_error = $2,
           status = case when attempts + 1 >= $3 then 'dead' else 'pending' end
       where id = $1`,
      [id, error ?? 'send failed', MAX_ATTEMPTS],
    );
  }
  return NextResponse.json({ ok: true });
}

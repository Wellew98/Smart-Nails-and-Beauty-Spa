import { NextResponse } from 'next/server';
import { getReminderDue, stampReminderSent } from '@/lib/booking';
import { sendReminder } from '@/lib/email';
import { getBusiness } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

/**
 * Outcomes build (video system 2): 24h reminder cron.
 *
 * Called daily by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is
 * set; anything else gets a 401. Without CRON_SECRET the route is disabled
 * rather than open. Sends are sequential and stamped ONLY on success, so a
 * failed mail is retried tomorrow instead of skipped forever.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, disabled: true, message: 'CRON_SECRET not configured.' },
      { status: 503 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  const business = await getBusiness();
  if (!business) return NextResponse.json({ ok: false, message: 'No business.' }, { status: 500 });

  const due = await getReminderDue(business.id, new Date());
  let sent = 0;
  for (const appointment of due) {
    if (await sendReminder(appointment)) {
      await stampReminderSent(appointment.id);
      sent += 1;
    }
  }
  return NextResponse.json({ ok: true, due: due.length, sent });
}

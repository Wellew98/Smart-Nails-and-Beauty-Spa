import { NextResponse } from 'next/server';
import { getWinbackCandidates, stampWinbackSent } from '@/lib/booking';
import { sendWinback } from '@/lib/email';
import { getBusiness } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

/**
 * Outcomes build (video system 2): win-back cron.
 *
 * Weekly (see vercel.json). Same auth and stamp-on-success contract as the
 * reminder cron. Candidates exclude anyone with an upcoming booking, so a
 * customer who is already coming back never gets a "we miss you" mail.
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

  const candidates = await getWinbackCandidates(business.id, new Date());
  let sent = 0;
  for (const candidate of candidates) {
    if (
      await sendWinback({
        to: candidate.email,
        name: candidate.name,
        businessName: business.name,
        businessPhone: business.phone,
      })
    ) {
      await stampWinbackSent(candidate.id);
      sent += 1;
    }
  }
  return NextResponse.json({ ok: true, due: candidates.length, sent });
}

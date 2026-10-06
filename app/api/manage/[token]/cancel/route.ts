import { NextResponse, after } from 'next/server';
import { cancelBooking, getAppointmentByToken } from '@/lib/booking';
import { sendCancellationNotice } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * POST /api/manage/:token/cancel — spec §6.
 *
 * The manage token is the only credential. It is 32 random bytes, so it is not
 * guessable, and it grants access to exactly one booking.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const appointment = await getAppointmentByToken(token);
  if (!appointment) {
    return NextResponse.json({ error: 'not_found', message: 'That booking could not be found.' }, { status: 404 });
  }

  const result = await cancelBooking({ appointmentId: appointment.id, actor: 'customer' });

  if (!result.ok) {
    // "Too late to cancel online" is a rule, not a server fault.
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.error === 'too_late' ? 409 : 400 },
    );
  }

  // After the response: the customer has cancelled and should see that
  // immediately, whatever the mail server is doing.
  after(async () => {
    await sendCancellationNotice(appointment);
  });
  return NextResponse.json({ ok: true });
}

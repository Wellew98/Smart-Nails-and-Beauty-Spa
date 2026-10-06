import { NextResponse, after } from 'next/server';
import { forgetCustomer, getAppointmentByToken } from '@/lib/booking';
import { sendCancellationNotice } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * POST /api/manage/:token/forget — spec §9.4, "delete my details".
 *
 * The manage token is the only credential, exactly as for cancel. It is 32
 * random bytes and grants access to one customer's own record, which is the
 * right authority for someone erasing their own details.
 *
 * The token is consumed by succeeding: `forgetCustomer` rotates every manage
 * token belonging to this customer, so a replay of this request 404s. That is
 * intended — the record it pointed at no longer identifies anyone.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const appointment = await getAppointmentByToken(token);
  if (!appointment) {
    return NextResponse.json(
      { error: 'not_found', message: 'That booking could not be found.' },
      { status: 404 },
    );
  }

  const result = await forgetCustomer({ customerId: appointment.customer_id, actor: 'customer' });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 404 });
  }

  // After COMMIT, and never able to fail the erasure — the same rule the
  // booking path follows for its confirmation. The owner is told which
  // appointments vanished from her diary and who they were, because otherwise
  // she finds an unexplained gap on a Saturday. This is the last processing of
  // those details, and it is what completes the cancellation.
  after(async () => {
    for (const cancelled of result.cancelled) {
      await sendCancellationNotice(cancelled);
    }
  });

  return NextResponse.json({
    ok: true,
    cancelled: result.cancelled.length,
    already_erased: result.alreadyErased,
  });
}

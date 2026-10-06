import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getAppointmentById, getAppointmentByToken, rescheduleBooking } from '@/lib/booking';
import { getActiveStaff, getBusiness } from '@/lib/public-data';
import { sendCustomerConfirmation, sendOwnerNotification } from '@/lib/email';
import { formatSlotLabel } from '@/lib/time';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  starts_at: z.iso.datetime({ offset: true }),
  staff_id: z.union([z.uuid(), z.literal('any'), z.null()]).optional(),
});

/**
 * POST /api/manage/:token/reschedule — spec §6.
 *
 * Runs the same availability and booking logic as a new booking, and the same
 * exclusion constraints. The old row is cancelled and the new one created in
 * one transaction (see lib/booking.ts), so a move can never leave the customer
 * with two bookings or none.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Expected JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.issues }, { status: 400 });
  }

  const appointment = await getAppointmentByToken(token);
  if (!appointment) {
    return NextResponse.json({ error: 'not_found', message: 'That booking could not be found.' }, { status: 404 });
  }

  const staffId = !parsed.data.staff_id || parsed.data.staff_id === 'any' ? null : parsed.data.staff_id;

  const result = await rescheduleBooking({
    appointmentId: appointment.id,
    startsAt: new Date(parsed.data.starts_at),
    staffId,
    actor: 'customer',
  });

  if (!result.ok) {
    if (result.error === 'slot_taken') {
      const business = await getBusiness();
      const staff = business ? await getActiveStaff(business.id) : [];
      const staffNames = new Map(staff.map((member) => [member.id, member.name]));
      return NextResponse.json(
        {
          error: 'slot_taken',
          message: result.message,
          slots: result.slots.map((slot) => ({
            startsAt: slot.startsAt.toISOString(),
            label: formatSlotLabel(slot.startsAt, business?.timezone ?? 'Africa/Johannesburg'),
            staffName: staffNames.get(slot.staffId) ?? '',
          })),
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.error === 'too_late' ? 409 : 400 },
    );
  }

  const detail = await getAppointmentById(result.appointment.id);
  if (detail) {
    // After the response, so a slow mailer never delays the new time showing.
    after(async () => {
      await Promise.all([sendCustomerConfirmation(detail), sendOwnerNotification(detail)]);
    });
  }

  // The manage token travels to the new row, so the customer's link is unchanged.
  return NextResponse.json({ ok: true, manage_url: `/b/${result.appointment.manage_token}` });
}

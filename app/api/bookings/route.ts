import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { createBooking, getAppointmentById } from '@/lib/booking';
import { getBusiness } from '@/lib/public-data';
import { sendCustomerConfirmation, sendOwnerNotification } from '@/lib/email';
import { formatSlotLabel } from '@/lib/time';
import { getActiveStaff } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings — spec §5.
 *
 * Runs server-side against the database with credentials that never reach the
 * browser. The browser MUST NOT write to `appointments` directly, and under the
 * RLS policies in migration 0002 it cannot even if it tries.
 */

const bodySchema = z.object({
  service_id: z.uuid(),
  staff_id: z.union([z.uuid(), z.literal('any'), z.null()]).optional(),
  starts_at: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1, 'Please tell us your name').max(120),
  phone: z.string().trim().min(1, 'We need a phone number'),
  email: z.union([z.email(), z.literal('')]).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotency_key: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Expected JSON.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: parsed.error.issues[0]?.message ?? 'Please check the form and try again.',
        detail: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const business = await getBusiness();
  if (!business) return NextResponse.json({ error: 'no_business' }, { status: 500 });

  const { service_id, staff_id, starts_at, name, phone, email, notes, idempotency_key } = parsed.data;

  const result = await createBooking({
    businessId: business.id,
    serviceId: service_id,
    staffId: !staff_id || staff_id === 'any' ? null : staff_id,
    startsAt: new Date(starts_at),
    name,
    phone,
    email: email || null,
    notes: notes ?? null,
    idempotencyKey: idempotency_key,
    source: 'web',
  });

  if (!result.ok) {
    // §5 step 8: the slot went while they were typing. Hand back a fresh list
    // so the picker can re-render rather than dead-ending.
    if (result.error === 'slot_taken') {
      const staff = await getActiveStaff(business.id);
      const staffNames = new Map(staff.map((member) => [member.id, member.name]));
      return NextResponse.json(
        {
          error: 'slot_taken',
          message: result.message,
          slots: result.slots.map((slot) => ({
            startsAt: slot.startsAt.toISOString(),
            label: formatSlotLabel(slot.startsAt, business.timezone),
            staffName: staffNames.get(slot.staffId) ?? '',
          })),
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: result.error, message: result.message }, { status: 400 });
  }

  const detail = await getAppointmentById(result.appointment.id);

  // A replay of the same idempotency key must not send a second confirmation.
  //
  // Dispatched with after(), so the customer's confirmation screen is not
  // waiting on a mail server. It used to be awaited here, which was fine
  // against an HTTP API and would not be against SMTP: a STARTTLS handshake
  // and conversation is seconds, and spec §3 is "book in under 60 seconds".
  // after() runs this once the response has been sent, and keeps the function
  // alive to do it rather than letting the platform freeze mid-send.
  if (detail && !result.replayed) {
    after(async () => {
      await Promise.all([sendCustomerConfirmation(detail), sendOwnerNotification(detail)]);
    });
  }

  return NextResponse.json(
    {
      appointment: {
        id: result.appointment.id,
        starts_at: result.appointment.starts_at,
        ends_at: result.appointment.ends_at,
        service_name: detail?.service_name ?? null,
        staff_name: detail?.staff_name ?? null,
        price_cents: result.appointment.price_cents_at_booking,
      },
      manage_url: `/b/${result.appointment.manage_token}`,
    },
    { status: result.replayed ? 200 : 201 },
  );
}

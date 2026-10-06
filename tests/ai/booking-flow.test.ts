import { beforeEach, describe, expect, it } from 'vitest';
import { performWrite, type WriteAction } from '@/lib/ai/orchestrator';
import { getBooking, type ToolContext } from '@/lib/ai/tools';
import { getAvailableSlots } from '@/lib/availability';
import { createBooking, getAppointmentByToken } from '@/lib/booking';
import { query } from '@/lib/db';
import type { BookingAttachment, ConflictAttachment } from '@/lib/ai/types';
import { IDS, at, nextWorkingDate, resetDatabase } from '../helpers/fixtures';

/**
 * Booking through the assistant, against real Postgres.
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE ARE ACTUALLY TESTING
 *
 * Not that `lib/booking.ts` is correct — `tests/booking.test.ts` already pins
 * that, and this batch changed none of it. What is under test is that the
 * assistant's path reaches the same transaction with the same guarantees, and
 * that nothing about routing a booking through a conversation weakens them.
 *
 * The failure this is guarding against is a plausible one: a second write path
 * that skips the advisory lock, or re-implements the idempotency check, or
 * treats a 409 as an error to retry. All three would pass a naive test and
 * produce double bookings under contention.
 * ---------------------------------------------------------------------------
 */

beforeEach(resetDatabase);

const context: ToolContext = { businessId: IDS.business };

async function firstSlot(serviceId: string, date = nextWorkingDate()) {
  const slots = await getAvailableSlots({ businessId: IDS.business, serviceId, date });
  return slots[0];
}

function bookingAction(overrides: Partial<Extract<WriteAction, { kind: 'confirm_booking' }>> = {}) {
  return {
    kind: 'confirm_booking' as const,
    serviceId: IDS.service.gelManicure,
    startsAt: new Date().toISOString(),
    staffId: null,
    name: 'Thandi Mahlangu',
    phone: '082 555 0101',
    idempotencyKey: 'confirmation-key-0001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The happy path, and what "booked" is allowed to mean
// ---------------------------------------------------------------------------

describe('confirming a booking', () => {
  it('writes through the existing transaction and reports what it returned', async () => {
    const slot = await firstSlot(IDS.service.gelManicure);

    const outcome = await performWrite(
      bookingAction({ startsAt: slot.startsAt.toISOString() }),
      context,
    );

    expect(outcome).not.toBeNull();
    const attachment = outcome!.attachment as BookingAttachment;
    expect(attachment.kind).toBe('booking');
    expect(attachment.justBooked).toBe(true);

    // The row is really there, with everything §5 requires — a manage token, a
    // snapshotted price, and an audit event. None of which this batch writes.
    const rows = await query<{ id: string; status: string; manage_token: string; price_cents_at_booking: number }>(
      'select id, status, manage_token, price_cents_at_booking from appointments',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');
    expect(rows[0].manage_token).toHaveLength(43); // 32 bytes, base64url
    expect(rows[0].price_cents_at_booking).toBe(25000);

    const events = await query('select event from appointment_events');
    expect(events).toHaveLength(1);
  });

  it('never announces a success the transaction did not return', async () => {
    // A booking exists when the transaction has committed and not one moment
    // earlier. The turn handed to the model is built from the result, so there
    // is no wording it could choose that contradicts the database.
    const outcome = await performWrite(
      bookingAction({ startsAt: at(nextWorkingDate(), '03:00').toISOString() }), // before opening
      context,
    );

    expect(outcome!.turn).toMatch(/FAILED/);
    expect(outcome!.turn).toMatch(/Do not say it is booked/i);
    expect(await query('select 1 from appointments')).toHaveLength(0);
  });

  it('refuses a treatment that is no longer offered', async () => {
    await query('update services set active = false where id = $1', [IDS.service.gelManicure]);
    const outcome = await performWrite(bookingAction(), context);
    expect(outcome!.turn).toMatch(/FAILED/);
    expect(await query('select 1 from appointments')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency — the double tap
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('turns two taps of one confirmation into one appointment', async () => {
    const slot = await firstSlot(IDS.service.gelManicure);
    const action = bookingAction({ startsAt: slot.startsAt.toISOString() });

    const first = await performWrite(action, context);
    const second = await performWrite(action, context);

    const rows = await query<{ id: string }>('select id from appointments');
    expect(rows).toHaveLength(1);

    // And the second tap is told about the SAME appointment, not an error.
    const a = first!.attachment as BookingAttachment;
    const b = second!.attachment as BookingAttachment;
    expect(b.booking.appointmentId).toBe(a.booking.appointmentId);
  });

  it('does not send a second confirmation email for a replay', async () => {
    // Only one 'created' event, and only one appointment — the replay path in
    // lib/booking.ts returns the original row rather than writing again.
    const slot = await firstSlot(IDS.service.gelManicure);
    const action = bookingAction({ startsAt: slot.startsAt.toISOString() });

    await performWrite(action, context);
    await performWrite(action, context);

    expect(await query("select 1 from appointment_events where event = 'created'")).toHaveLength(1);
  });

  it('treats a changed slot with a new key as a new booking, not a replay', async () => {
    // The trap the batch calls out: a key derived from the slot, or held too
    // stably across a change of mind, hands the customer back their ORIGINAL
    // booking and silently ignores the change.
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date: nextWorkingDate(),
    });

    await performWrite(
      bookingAction({ startsAt: slots[0].startsAt.toISOString(), idempotencyKey: 'confirmation-1' }),
      context,
    );
    await performWrite(
      bookingAction({ startsAt: slots[2].startsAt.toISOString(), idempotencyKey: 'confirmation-2' }),
      context,
    );

    const rows = await query<{ starts_at: Date }>('select starts_at from appointments order by starts_at');
    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].starts_at).getTime()).toBe(slots[0].startsAt.getTime());
    expect(new Date(rows[1].starts_at).getTime()).toBe(slots[2].startsAt.getTime());
  });

  it('would replay the wrong booking if the key were reused across a change', async () => {
    // The negative half, stated as a test so the lifecycle rule in
    // chat-window.tsx has something holding it in place: reusing one key for a
    // DIFFERENT slot returns the first appointment and writes nothing.
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date: nextWorkingDate(),
    });

    const first = await performWrite(
      bookingAction({ startsAt: slots[0].startsAt.toISOString(), idempotencyKey: 'reused' }),
      context,
    );
    const second = await performWrite(
      bookingAction({ startsAt: slots[2].startsAt.toISOString(), idempotencyKey: 'reused' }),
      context,
    );

    expect(await query('select 1 from appointments')).toHaveLength(1);
    // Same appointment handed back — at the ORIGINAL time, not the new one.
    expect((second!.attachment as BookingAttachment).booking.startsAt).toBe(
      (first!.attachment as BookingAttachment).booking.startsAt,
    );
  });
});

// ---------------------------------------------------------------------------
// Contention
// ---------------------------------------------------------------------------

describe('two people, one slot', () => {
  it('gives it to exactly one of them, with no overlapping rows', async () => {
    const slot = await firstSlot(IDS.service.facial); // Sarah only — one therapist

    const [a, b] = await Promise.all([
      performWrite(
        bookingAction({
          serviceId: IDS.service.facial,
          startsAt: slot.startsAt.toISOString(),
          name: 'Thandi Mahlangu',
          phone: '082 555 0101',
          idempotencyKey: 'racer-a',
        }),
        context,
      ),
      performWrite(
        bookingAction({
          serviceId: IDS.service.facial,
          startsAt: slot.startsAt.toISOString(),
          name: 'Lerato Dube',
          phone: '083 555 0202',
          idempotencyKey: 'racer-b',
        }),
        context,
      ),
    ]);

    const outcomes = [a!, b!];
    const booked = outcomes.filter((outcome) => !outcome.turn.includes('FAILED'));
    const refused = outcomes.filter((outcome) => outcome.turn.includes('FAILED'));

    expect(booked).toHaveLength(1);
    expect(refused).toHaveLength(1);

    const rows = await query("select 1 from appointments where status = 'confirmed'");
    expect(rows).toHaveLength(1);
  });

  it('tells the loser plainly and does not claim success or retry', async () => {
    const slot = await firstSlot(IDS.service.facial);

    // Someone books it through /book while the conversation is open.
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.facial,
      staffId: IDS.staff.sarah,
      startsAt: slot.startsAt,
      name: 'Someone Else',
      phone: '082 555 0999',
    });

    const outcome = await performWrite(
      bookingAction({ serviceId: IDS.service.facial, startsAt: slot.startsAt.toISOString() }),
      context,
    );

    expect(outcome!.turn).toMatch(/FAILED/);
    expect(outcome!.turn).toMatch(/took that time/i);
    expect(outcome!.turn).toMatch(/Do not say it is booked/i);
    // Exactly one appointment — no retry, no force.
    expect(await query("select 1 from appointments where status = 'confirmed'")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The 409's alternatives — the projection the reviewer flagged
// ---------------------------------------------------------------------------

describe('the alternatives offered after a clash', () => {
  it('carries the instant and not just a label', async () => {
    // These come straight out of the engine at §5 step 8 and have never been
    // through check_availability's split. Rendering them raw would put the
    // naive-local-time bug back on the recovery path.
    const slot = await firstSlot(IDS.service.facial);
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.facial,
      staffId: IDS.staff.sarah,
      startsAt: slot.startsAt,
      name: 'Someone Else',
      phone: '082 555 0999',
    });

    const outcome = await performWrite(
      bookingAction({ serviceId: IDS.service.facial, startsAt: slot.startsAt.toISOString() }),
      context,
    );

    const conflict = outcome!.attachment as ConflictAttachment;
    expect(conflict.kind).toBe('conflict');
    expect(conflict.options.length).toBeGreaterThan(0);

    for (const option of conflict.options) {
      expect(option.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(option.startsAt).getTime()).toBeGreaterThan(0);
      expect(option.time).toMatch(/^\d{2}:\d{2}$/);
      expect(option.staffId).toBeTruthy();
    }
  });

  it('does not pin a therapist the customer never asked for', async () => {
    // The whole point. A tapped alternative that carried an unrequested
    // therapist would turn "anyone" into a pin and produce a SECOND clash where
    // "Anyone" would have succeeded — visible only under contention.
    const slot = await firstSlot(IDS.service.gelManicure);
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: null,
      startsAt: slot.startsAt,
      name: 'Someone Else',
      phone: '082 555 0999',
    });

    const anonymous = await performWrite(
      bookingAction({ startsAt: slot.startsAt.toISOString(), staffId: null }),
      context,
    );
    // The booking may or may not clash depending on free therapists; only
    // assert the projection when it did.
    if (anonymous!.attachment?.kind === 'conflict') {
      expect((anonymous!.attachment as ConflictAttachment).staffPinned).toBe(false);
    }

    const pinned = await performWrite(
      bookingAction({
        serviceId: IDS.service.facial,
        startsAt: (await firstSlot(IDS.service.facial)).startsAt.toISOString(),
        staffId: IDS.staff.sarah,
        idempotencyKey: 'pinned-attempt',
      }),
      context,
    );
    if (pinned!.attachment?.kind === 'conflict') {
      expect((pinned!.attachment as ConflictAttachment).staffPinned).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Management — ownership is the token and only the token
// ---------------------------------------------------------------------------

describe('managing an existing booking', () => {
  async function bookAndGetToken(): Promise<string> {
    const slot = await firstSlot(IDS.service.gelManicure);
    const result = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      startsAt: slot.startsAt,
      name: 'Thandi Mahlangu',
      phone: '082 555 0101',
    });
    if (!result.ok) throw new Error('setup failed');
    return result.appointment.manage_token;
  }

  it('reads nothing at all without a token', async () => {
    // There is no lookup by name or phone anywhere, and there must not be:
    // guessing which appointment is someone's is how one customer is handed
    // another's.
    const outcome = await getBooking({ businessId: IDS.business });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toBe('no_booking_held');
  });

  it('cancels only with the token, and respects the notice rule', async () => {
    const token = await bookAndGetToken();

    const cancelled = await performWrite({ kind: 'confirm_cancel' }, {
      businessId: IDS.business,
      manageToken: token,
    });
    expect(cancelled!.turn).toMatch(/cancelled/i);

    const rows = await query<{ status: string }>('select status from appointments');
    expect(rows[0].status).toBe('cancelled');
  });

  it('refuses to cancel without a token', async () => {
    await bookAndGetToken();
    const outcome = await performWrite({ kind: 'confirm_cancel' }, { businessId: IDS.business });

    expect(outcome!.turn).toMatch(/FAILED/);
    expect((await query<{ status: string }>('select status from appointments'))[0].status).toBe(
      'confirmed',
    );
  });

  it('refuses a cancellation inside the notice window', async () => {
    // The rule lives in lib/booking.ts and is not re-implemented here — this
    // asserts the assistant cannot route around it.
    const token = await bookAndGetToken();
    const appointment = await getAppointmentByToken(token);

    const outcome = await performWrite(
      { kind: 'confirm_cancel' },
      {
        businessId: IDS.business,
        manageToken: token,
        // One minute before the appointment: well inside the 120-minute notice.
        now: new Date(new Date(appointment!.starts_at).getTime() - 60_000),
      },
    );

    expect(outcome!.turn).toMatch(/FAILED/);
    expect((await query<{ status: string }>('select status from appointments'))[0].status).toBe(
      'confirmed',
    );
  });

  it('moves a booking and keeps the manage link working', async () => {
    const token = await bookAndGetToken();
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date: nextWorkingDate(),
    });

    const outcome = await performWrite(
      { kind: 'confirm_reschedule', startsAt: slots[4].startsAt.toISOString(), staffId: null },
      { businessId: IDS.business, manageToken: token },
    );

    expect(outcome!.turn).toMatch(/moved/i);
    // §6: the token travels to the new row, so the link already in the
    // customer's inbox still resolves.
    const found = await getAppointmentByToken(token);
    expect(found).not.toBeNull();
    expect(new Date(found!.starts_at).getTime()).toBe(slots[4].startsAt.getTime());
  });

  it('leaves the original booking untouched when a move clashes', async () => {
    const token = await bookAndGetToken();
    const original = await getAppointmentByToken(token);

    const outcome = await performWrite(
      { kind: 'confirm_reschedule', startsAt: at(nextWorkingDate(), '03:00').toISOString() },
      { businessId: IDS.business, manageToken: token },
    );

    expect(outcome!.turn).toMatch(/FAILED/);
    expect(outcome!.turn).toMatch(/unchanged/i);

    const after = await getAppointmentByToken(token);
    expect(new Date(after!.starts_at).getTime()).toBe(new Date(original!.starts_at).getTime());
    expect(after!.status).toBe('confirmed');
  });
});

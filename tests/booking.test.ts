import { beforeEach, describe, expect, it } from 'vitest';
import { getAvailableSlots } from '@/lib/availability';
import { cancelBooking, createBooking, rescheduleBooking, getAppointmentByToken } from '@/lib/booking';
import { query } from '@/lib/db';
import {
  IDS,
  at,
  countLiveAppointments,
  findOverlappingPairs,
  labels,
  nextWorkingDate,
  resetDatabase,
} from './helpers/fixtures';

beforeEach(resetDatabase);

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

// ---------------------------------------------------------------------------
// §9.1 — "Test 1 and test 8 are the two that matter."
// ---------------------------------------------------------------------------
describe('§9.1 Concurrency', () => {
  it('lets exactly one of 20 simultaneous bookings win, ten runs in a row', async () => {
    for (let run = 1; run <= 10; run++) {
      await resetDatabase();
      const date = nextWorkingDate();
      const startsAt = at(date, '10:00');

      // All 20 aim at the same therapist at the same instant, so there is
      // exactly one seat. Fired without awaiting in between: they are in
      // flight together.
      const attempts = Array.from({ length: 20 }, (_, index) =>
        createBooking({
          businessId: IDS.business,
          serviceId: IDS.service.fullBodyMassage,
          staffId: IDS.staff.sarah,
          startsAt,
          name: `Racer ${index}`,
          phone: `08255500${String(index).padStart(2, '0')}`,
        }),
      );

      const results = await Promise.all(attempts);
      const won = results.filter((r) => r.ok);
      const lost = results.filter((r) => !r.ok);

      expect(won, `run ${run}: expected exactly one winner`).toHaveLength(1);
      expect(lost, `run ${run}: expected nineteen losers`).toHaveLength(19);
      for (const failure of lost) {
        expect(failure.ok).toBe(false);
        if (!failure.ok) expect(failure.error).toBe('slot_taken');
      }

      // The assertion that actually matters: ask the database, not the app.
      expect(await findOverlappingPairs(), `run ${run}: overlapping rows in the database`).toEqual([]);
      expect(await countLiveAppointments()).toBe(1);
    }
  });

  it('allows concurrent bookings that genuinely do not collide', async () => {
    const date = nextWorkingDate();
    // Three therapists, no resource needed — all three may win.
    const results = await Promise.all(
      [IDS.staff.sarah, IDS.staff.nomsa, IDS.staff.lerato].map((staffId, index) =>
        createBooking({
          businessId: IDS.business,
          serviceId: IDS.service.gelManicure,
          staffId,
          startsAt: at(date, '10:00'),
          name: `Client ${index}`,
          phone: `08255501${String(index).padStart(2, '0')}`,
        }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await findOverlappingPairs()).toEqual([]);
  });

  it('serialises 20 concurrent attempts on a single shared resource', async () => {
    const date = nextWorkingDate();
    // One pedicure chair, three therapists: the chair is the bottleneck.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createBooking({
          businessId: IDS.business,
          serviceId: IDS.service.pedicure,
          staffId: [IDS.staff.sarah, IDS.staff.nomsa, IDS.staff.lerato][index % 3],
          startsAt: at(date, '11:00'),
          name: `Racer ${index}`,
          phone: `08255502${String(index).padStart(2, '0')}`,
        }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await findOverlappingPairs()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §9.6
// ---------------------------------------------------------------------------
describe('§9.6 Idempotency', () => {
  it('returns the same appointment for a repeated idempotency key, and writes one row', async () => {
    const date = nextWorkingDate();
    const input = {
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
      idempotencyKey: 'attempt-abc-123',
    };

    const first = await createBooking(input);
    const second = await createBooking(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.appointment.id).toBe(first.appointment.id);
    expect(second.replayed).toBe(true);
    expect(await countLiveAppointments()).toBe(1);
  });

  it('survives a genuine double-tap where both requests are in flight', async () => {
    const date = nextWorkingDate();
    const input = {
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
      idempotencyKey: 'double-tap-xyz',
    };

    // Neither request sees the other's row on the fast path — the unique
    // constraint on (business_id, idempotency_key) is what saves us.
    const [a, b] = await Promise.all([createBooking(input), createBooking(input)]);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.appointment.id).toBe(b.appointment.id);
    expect(await countLiveAppointments()).toBe(1);
  });

  it('treats different keys for the same slot as genuinely competing bookings', async () => {
    const date = nextWorkingDate();
    const base = {
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    };

    const first = await createBooking({ ...base, idempotencyKey: 'key-one' });
    const second = await createBooking({ ...base, idempotencyKey: 'key-two' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('slot_taken');
  });
});

// ---------------------------------------------------------------------------
// §9.7
// ---------------------------------------------------------------------------
describe('§9.7 Reschedule', () => {
  it('frees the old slot and holds the new one', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    const sarahBefore = labels(
      await getAvailableSlots({
        businessId: IDS.business,
        serviceId: IDS.service.fullBodyMassage,
        date,
        staffId: IDS.staff.sarah,
      }),
    );
    expect(sarahBefore).not.toContain('10:00');
    expect(sarahBefore).toContain('14:00');

    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '14:00'),
      staffId: IDS.staff.sarah,
      actor: 'customer',
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const sarahAfter = labels(
      await getAvailableSlots({
        businessId: IDS.business,
        serviceId: IDS.service.fullBodyMassage,
        date,
        staffId: IDS.staff.sarah,
      }),
    );
    expect(sarahAfter).toContain('10:00'); // old slot released
    expect(sarahAfter).not.toContain('14:00'); // new slot held

    expect(await countLiveAppointments()).toBe(1);
    expect(await findOverlappingPairs()).toEqual([]);
  });

  it('preserves customer_id and keeps the original manage link working', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');
    const originalToken = booked.appointment.manage_token;

    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '14:00'),
      actor: 'customer',
    });
    if (!moved.ok) throw new Error('reschedule failed');

    // §6: preserving customer_id.
    expect(moved.appointment.customer_id).toBe(booked.appointment.customer_id);
    expect(moved.appointment.rescheduled_from).toBe(booked.appointment.id);

    // The link already sitting in the customer's inbox must still resolve, and
    // must resolve to the NEW booking.
    const viaOldLink = await getAppointmentByToken(originalToken);
    expect(viaOldLink?.id).toBe(moved.appointment.id);
    expect(viaOldLink?.status).toBe('confirmed');
  });

  it('can shift a booking by 15 minutes without colliding with itself', async () => {
    const date = nextWorkingDate();
    // Deliberately the nastiest case: the new range overlaps the old range on
    // the same therapist AND the same room.
    await query('update resources set active = false where id = $1', [IDS.resource.massageRoom2]);

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '10:15'),
      actor: 'customer',
    });

    expect(moved.ok).toBe(true);
    expect(await countLiveAppointments()).toBe(1);
    expect(await findOverlappingPairs()).toEqual([]);
  });

  it('leaves the original booking intact when the new time is taken', async () => {
    const date = nextWorkingDate();

    const keep = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    const move = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '13:00'),
      name: 'Second Client',
      phone: '082 555 0199',
    });
    if (!keep.ok || !move.ok) throw new Error('setup failed');

    const result = await rescheduleBooking({
      appointmentId: move.appointment.id,
      startsAt: at(date, '10:00'),
      staffId: IDS.staff.sarah,
      actor: 'customer',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('slot_taken');

    // The transaction rolled back, so the booking she tried to move is still
    // exactly where it was. Losing it here would be catastrophic and silent.
    const stillThere = await query<{ status: string; starts_at: Date }>(
      'select status, starts_at from appointments where id = $1',
      [move.appointment.id],
    );
    expect(stillThere[0].status).toBe('confirmed');
    expect(new Date(stillThere[0].starts_at).getTime()).toBe(at(date, '13:00').getTime());
    expect(await countLiveAppointments()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §9.12
// ---------------------------------------------------------------------------
describe('§9.12 Admin double-book', () => {
  it('rejects the owner moving a booking onto a slot the same therapist already has, and names the clash', async () => {
    const date = nextWorkingDate();

    const existing = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      name: 'Ayanda Nkosi',
      phone: '082 555 0111',
    });
    const toMove = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '13:00'),
      ...customer,
    });
    if (!existing.ok || !toMove.ok) throw new Error('setup failed');

    // The owner is not exempt from double-booking checks (§7.1).
    const result = await rescheduleBooking({
      appointmentId: toMove.appointment.id,
      startsAt: at(date, '10:00'),
      staffId: IDS.staff.sarah,
      actor: 'admin',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('slot_taken');

    // "If the constraint rejects her edit, show her what it clashes with."
    if (result.error !== 'slot_taken') return;
    expect(result.clashesWith.length).toBeGreaterThan(0);
    const clash = result.clashesWith[0];
    expect(clash.appointment_id).toBe(existing.appointment.id);
    expect(clash.customer_name).toBe('Ayanda Nkosi');
    expect(clash.staff_name).toBe('Sarah');
    expect(clash.reason).toBe('staff');

    expect(await findOverlappingPairs()).toEqual([]);
    expect(await countLiveAppointments()).toBe(2);
  });

  it('rejects a walk-in that collides with an online booking', async () => {
    const date = nextWorkingDate();
    await query('update resources set active = false where id = $1', [IDS.resource.massageRoom2]);

    const online = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!online.ok) throw new Error('setup failed');

    // Owner enters a walk-in for a different therapist — but the only room
    // left is already taken.
    const walkin = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.nomsa,
      startsAt: at(date, '10:30'),
      name: 'Counter Client',
      phone: '082 555 0177',
      source: 'walkin',
    });

    expect(walkin.ok).toBe(false);
    if (walkin.ok) return;
    expect(walkin.error).toBe('slot_taken');
    expect(await findOverlappingPairs()).toEqual([]);
  });

  it('lets the owner book a walk-in outside working hours and inside the notice window', async () => {
    const date = nextWorkingDate();
    // 08:00 is before the 09:00 opening, and `now` is only minutes earlier —
    // both would stop a customer. The person is standing at the counter.
    const result = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '08:00'),
      name: 'Counter Client',
      phone: '082 555 0166',
      source: 'walkin',
      now: at(date, '07:55'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.source).toBe('walkin');
  });
});

describe('cancellation', () => {
  it('releases the slot and records an audit event', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const cancelled = await cancelBooking({ appointmentId: booked.appointment.id, actor: 'customer' });
    expect(cancelled.ok).toBe(true);

    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
      staffId: IDS.staff.sarah,
    });
    expect(labels(slots)).toContain('10:00');

    const events = await query<{ event: string }>(
      'select event from appointment_events where appointment_id = $1 order by created_at',
      [booked.appointment.id],
    );
    expect(events.map((e) => e.event)).toEqual(['created', 'cancelled']);
  });

  it('refuses a customer cancellation inside the minimum-notice window', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // 09:30 on the day — inside the 120-minute window before a 10:00 start.
    const result = await cancelBooking({
      appointmentId: booked.appointment.id,
      actor: 'customer',
      now: at(date, '09:30'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('too_late');
  });

  it('lets the owner cancel at any time', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const result = await cancelBooking({
      appointmentId: booked.appointment.id,
      actor: 'admin',
      now: at(date, '09:55'),
    });
    expect(result.ok).toBe(true);
  });
});

describe('database errors keep their SQLSTATE', () => {
  /**
   * lib/db.ts wraps CONNECTION failures with a plain-English diagnosis so a
   * failed deploy says which cause it is. That wrapper must never touch query
   * errors: §5 step 8 dispatches on SQLSTATE 23P01 specifically, and an
   * exclusion violation that arrives as a generic Error stops being a clean 409
   * and becomes a 500 — double bookings would still be refused, but the
   * customer would see a crash instead of fresh times.
   */
  it('passes an exclusion violation through untouched', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // Same therapist, overlapping range, straight through query() rather than
    // the write path, so nothing catches it on the way out.
    const clash = query(
      `insert into appointments (business_id, service_id, staff_id, customer_id,
                                 starts_at, ends_at, blocks_until, manage_token,
                                 price_cents_at_booking)
       values ($1,$2,$3,$4,$5,$6,$7,'regression-token',50000)`,
      [
        IDS.business,
        IDS.service.fullBodyMassage,
        IDS.staff.sarah,
        booked.appointment.customer_id,
        at(date, '10:30').toISOString(),
        at(date, '11:30').toISOString(),
        at(date, '11:45').toISOString(),
      ],
    );

    await expect(clash).rejects.toMatchObject({ code: '23P01' });
  });
});

describe('phone normalisation (§12)', () => {
  it('stores E.164 and treats formatting variants as the same customer', async () => {
    const date = nextWorkingDate();

    const first = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      name: 'Thandi Mahlangu',
      phone: '082 555 0101',
    });
    const second = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.nomsa,
      startsAt: at(date, '11:00'),
      name: 'Thandi Mahlangu',
      phone: '+27825550101', // same number, written differently
    });

    if (!first.ok || !second.ok) throw new Error('setup failed');
    expect(second.appointment.customer_id).toBe(first.appointment.customer_id);

    const stored = await query<{ phone: string }>('select phone from customers');
    expect(stored).toHaveLength(1);
    expect(stored[0].phone).toBe('+27825550101');
  });

  it('rejects an unparseable number', async () => {
    const date = nextWorkingDate();
    const result = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      name: 'Nobody',
      phone: 'not a phone number',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_phone');
  });
});

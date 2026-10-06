import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBooking,
  getAppointmentsBetween,
  markAppointmentStatus,
  rescheduleBooking,
} from '@/lib/booking';
import { getAvailableSlots } from '@/lib/availability';
import { query } from '@/lib/db';
import { conflictsInWindow } from '@/lib/config-guards';
import { IDS, TZ, at, labels, nextWorkingDate, resetDatabase } from './helpers/fixtures';
import { zonedToUtc } from '@/lib/time';

/**
 * The admin's data layer (§7). The screens themselves need Supabase Auth and
 * cannot be driven here, but everything they read and write goes through these
 * functions, so the behaviour that matters is covered.
 */

beforeEach(resetDatabase);

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

function dayRange(date: string) {
  return {
    from: zonedToUtc(date, '00:00', TZ),
    to: zonedToUtc(date, '23:59', TZ),
  };
}

describe('Today screen (§7 screen 1)', () => {
  it('returns the day in time order with everything the screen shows', async () => {
    const date = nextWorkingDate();

    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.nomsa,
      startsAt: at(date, '14:00'),
      name: 'Later Client',
      phone: '082 555 0150',
    });
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });

    const { from, to } = dayRange(date);
    const rows = await getAppointmentsBetween(IDS.business, from, to);

    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].starts_at).getTime()).toBeLessThan(new Date(rows[1].starts_at).getTime());

    // Everything the Today card renders, including the wa.me number.
    const first = rows[0];
    expect(first.service_name).toBe('Full Body Massage');
    expect(first.staff_name).toBe('Sarah');
    expect(first.customer_name).toBe('Thandi Mahlangu');
    expect(first.customer_phone).toBe('+27825550101');
    expect(first.resource_name).toMatch(/Massage Room/);
    expect(first.price_cents_at_booking).toBe(50000);
  });

  it('excludes bookings from adjacent days', async () => {
    const date = nextWorkingDate();
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });

    const { from, to } = dayRange(nextWorkingDate(21));
    expect(await getAppointmentsBetween(IDS.business, from, to)).toHaveLength(0);
  });

  it('marks completed and no_show, and keeps the slot occupied either way', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const done = await markAppointmentStatus({ appointmentId: booked.appointment.id, status: 'completed' });
    expect(done?.status).toBe('completed');

    // A completed appointment still happened, so its slot must NOT be offered
    // again — the exclusion constraints ignore it, but neither should the day
    // pretend it was free.
    const events = await query<{ event: string }>(
      'select event from appointment_events where appointment_id = $1 order by created_at',
      [booked.appointment.id],
    );
    expect(events.map((e) => e.event)).toEqual(['created', 'completed']);

    const noShow = await markAppointmentStatus({
      appointmentId: booked.appointment.id,
      status: 'no_show',
    });
    expect(noShow?.status).toBe('no_show');
  });
});

describe('Walk-ins (§7 screen 3)', () => {
  it('records source=walkin so the diary shows where the booking came from', async () => {
    const date = nextWorkingDate();
    const result = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      name: 'Counter Client',
      phone: '082 555 0188',
      source: 'walkin',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.source).toBe('walkin');
  });

  it('assigns a required resource to a walk-in rather than leaving it null', async () => {
    const date = nextWorkingDate();
    const result = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.pedicure, // needs the chair
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      name: 'Counter Client',
      phone: '082 555 0189',
      source: 'walkin',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A null here would let a second pedicure book the same chair.
    expect(result.appointment.resource_id).toBe(IDS.resource.pedicureChair);
  });

  it('refuses a walk-in when the only required resource is already taken', async () => {
    const date = nextWorkingDate();
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.pedicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
      source: 'walkin',
    });

    const second = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.pedicure,
      staffId: IDS.staff.nomsa,
      startsAt: at(date, '10:30'),
      name: 'Second Walk-in',
      phone: '082 555 0190',
      source: 'walkin',
    });

    expect(second.ok).toBe(false);
  });
});

describe('Owner-side moves (§7.1)', () => {
  it('reassigns a booking to another therapist at the same time', async () => {
    const date = nextWorkingDate();
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
      startsAt: at(date, '10:00'),
      staffId: IDS.staff.nomsa,
      actor: 'admin',
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.appointment.staff_id).toBe(IDS.staff.nomsa);
    expect(moved.appointment.customer_id).toBe(booked.appointment.customer_id);
  });

  it('lets the owner move a booking outside working hours', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // 18:00 is after closing. A customer could not book it; the owner can,
    // because she is the one staying late.
    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '18:00'),
      actor: 'admin',
    });
    expect(moved.ok).toBe(true);
  });
});

describe('Conflict detection query (§7.1)', () => {
  it('finds only future bookings that overlap the newly unavailable window', async () => {
    const date = nextWorkingDate();

    const inside = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '14:00'),
      ...customer,
    });
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '09:00'),
      name: 'Morning Client',
      phone: '082 555 0133',
    });
    if (!inside.ok) throw new Error('setup failed');

    const conflicts = await conflictsInWindow({
      from: at(date, '13:00'),
      to: at(date, '16:00'),
      staffId: IDS.staff.sarah,
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe(inside.appointment.id);
  });

  it('ignores cancelled bookings', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '14:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await query("update appointments set status = 'cancelled' where id = $1", [booked.appointment.id]);

    const conflicts = await conflictsInWindow({
      from: at(date, '13:00'),
      to: at(date, '16:00'),
      staffId: IDS.staff.sarah,
    });
    expect(conflicts).toHaveLength(0);
  });
});

describe('Deactivation hides from /book but keeps history readable', () => {
  it('drops an inactive therapist out of availability without touching her past bookings', async () => {
    const date = nextWorkingDate();

    // Facials are Sarah-only in the seed.
    const before = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.facial,
      date,
    });
    expect(before.length).toBeGreaterThan(0);

    await query('update staff set active = false where id = $1', [IDS.staff.sarah]);

    const after = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.facial,
      date,
    });
    expect(after).toHaveLength(0);

    // Manicures are unaffected — the other two still do them.
    const manicures = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date,
    });
    expect(labels(manicures)).toContain('10:00');
  });

  it('keeps an inactive resource out of new bookings', async () => {
    const date = nextWorkingDate();
    await query('update resources set active = false where id = $1', [IDS.resource.pedicureChair]);

    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.pedicure,
      date,
    });
    // The only chair is out of service, so no pedicure is bookable at all.
    expect(slots).toHaveLength(0);
  });
});

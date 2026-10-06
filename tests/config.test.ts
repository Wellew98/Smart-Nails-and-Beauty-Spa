import { beforeEach, describe, expect, it } from 'vitest';
import { getAvailableSlots } from '@/lib/availability';
import { createBooking, getAppointmentById, rescheduleBooking } from '@/lib/booking';
import {
  addAvailabilityBlock,
  deactivateResource,
  deactivateService,
  deactivateStaff,
  setWorkingHours,
  updateService,
} from '@/lib/config-guards';
import { query } from '@/lib/db';
import { IDS, at, labels, nextSaturday, nextWorkingDate, resetDatabase } from './helpers/fixtures';

beforeEach(resetDatabase);

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

// ---------------------------------------------------------------------------
// §9.9
// ---------------------------------------------------------------------------
describe('§9.9 Config immutability', () => {
  it('keeps an existing booking at 60 min / R500 after the service becomes 90 min / R650', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage, // 60 min, R500
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    expect(booked.appointment.price_cents_at_booking).toBe(50000);

    // The owner reprices and lengthens the treatment.
    await updateService(IDS.service.fullBodyMassage, { duration_minutes: 90, price_cents: 65000 });

    // The booking already on the books is untouched — §7.1: existing
    // appointments are immutable snapshots.
    const after = await getAppointmentById(booked.appointment.id);
    expect(after).not.toBeNull();
    expect(after!.price_cents_at_booking).toBe(50000);
    expect(new Date(after!.ends_at).getTime() - new Date(after!.starts_at).getTime()).toBe(60 * 60_000);

    // And a booking made afterwards uses the new numbers.
    const later = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.nomsa,
      startsAt: at(date, '13:00'),
      name: 'Ayanda Nkosi',
      phone: '082 555 0122',
    });
    if (!later.ok) throw new Error('second booking failed');

    expect(later.appointment.price_cents_at_booking).toBe(65000);
    expect(new Date(later.appointment.ends_at).getTime() - new Date(later.appointment.starts_at).getTime()).toBe(
      90 * 60_000,
    );
  });

  it('keeps the original price when an old booking is rescheduled after a price rise', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await updateService(IDS.service.fullBodyMassage, { price_cents: 65000 });

    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '14:00'),
      actor: 'customer',
    });
    if (!moved.ok) throw new Error('reschedule failed');

    // She booked at R500. Moving the time is not a reason to charge her R650.
    expect(moved.appointment.price_cents_at_booking).toBe(50000);
  });

  it('leaves existing bookings alone when turnaround changes', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');
    const originalBlocksUntil = new Date(booked.appointment.blocks_until).getTime();

    await updateService(IDS.service.fullBodyMassage, { turnaround_minutes: 45 });

    const after = await getAppointmentById(booked.appointment.id);
    expect(new Date(after!.blocks_until).getTime()).toBe(originalBlocksUntil);
  });
});

// ---------------------------------------------------------------------------
// §9.10
// ---------------------------------------------------------------------------
describe('§9.10 Orphan prevention', () => {
  it('blocks deactivating a therapist who has an upcoming booking, and returns it', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const result = await deactivateStaff(IDS.staff.sarah);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('has_upcoming_bookings');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].id).toBe(booked.appointment.id);
    expect(result.conflicts[0].customer_name).toBe('Thandi Mahlangu');
    expect(result.conflicts[0].customer_phone).toBe('+27825550101');

    // The save really was blocked — she is still active.
    const staff = await query<{ active: boolean }>('select active from staff where id = $1', [IDS.staff.sarah]);
    expect(staff[0].active).toBe(true);
  });

  it('allows the deactivation once the booking is reassigned', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // Reassignment goes through the same write path and the same constraints.
    const moved = await rescheduleBooking({
      appointmentId: booked.appointment.id,
      startsAt: at(date, '10:00'),
      staffId: IDS.staff.nomsa,
      actor: 'admin',
    });
    expect(moved.ok).toBe(true);

    const result = await deactivateStaff(IDS.staff.sarah);
    expect(result.ok).toBe(true);

    const staff = await query<{ active: boolean }>('select active from staff where id = $1', [IDS.staff.sarah]);
    expect(staff[0].active).toBe(false);
  });

  it('blocks deactivating a resource that upcoming bookings depend on', async () => {
    const date = nextWorkingDate();
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.pedicure, // needs the chair
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });

    const result = await deactivateResource(IDS.resource.pedicureChair);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('has_upcoming_bookings');
    expect(result.conflicts).toHaveLength(1);
  });

  it('ignores bookings in the past when deciding', async () => {
    // A booking that already happened cannot be orphaned by a future change.
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // Ask as though we are well past that appointment.
    const later = new Date(at(date, '10:00').getTime() + 30 * 24 * 3600 * 1000);
    const result = await deactivateStaff(IDS.staff.sarah, later);
    expect(result.ok).toBe(true);
  });

  it('warns but proceeds when deactivating a SERVICE, and hides it from /book', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // §7.1: "Warn: '3 upcoming bookings use this. They will go ahead.'"
    const result = await deactivateService(IDS.service.fullBodyMassage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].id).toBe(booked.appointment.id);

    // The booking goes ahead...
    const still = await getAppointmentById(booked.appointment.id);
    expect(still!.status).toBe('confirmed');

    // ...but the service is gone from the booking flow.
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
    });
    expect(slots).toHaveLength(0);
  });

  it('never hard-deletes: removing a service with history fails loudly', async () => {
    const date = nextWorkingDate();
    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });

    // §7.1: the foreign keys are NO ACTION on purpose — a delete attempt
    // fails rather than orphaning history.
    await expect(
      query('delete from services where id = $1', [IDS.service.fullBodyMassage]),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });
});

// ---------------------------------------------------------------------------
// §9.11
// ---------------------------------------------------------------------------
describe('§9.11 Hours conflict', () => {
  it('surfaces a 15:00 Saturday booking when Saturday hours are narrowed to 14:00', async () => {
    const saturday = nextSaturday();

    // The seed closes at 14:00 on Saturdays; widen it so a 15:00 booking is
    // possible in the first place, which is the situation the test describes.
    await query("update working_hours set end_time = '17:00' where day_of_week = 6");

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(saturday, '15:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    // Now narrow it back. This must NOT silently orphan or cancel her.
    const preview = await setWorkingHours({
      businessId: IDS.business,
      staffId: IDS.staff.sarah,
      dayOfWeek: 6,
      windows: [{ start_time: '09:00', end_time: '14:00' }],
    });

    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.error).toBe('would_orphan_bookings');
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].id).toBe(booked.appointment.id);

    // Nothing was saved by the preview.
    const hours = await query<{ end_time: string }>(
      'select end_time from working_hours where staff_id = $1 and day_of_week = 6',
      [IDS.staff.sarah],
    );
    expect(hours[0].end_time).toBe('17:00:00');

    // The owner chooses to go ahead: hours change, the booking survives.
    const confirmed = await setWorkingHours({
      businessId: IDS.business,
      staffId: IDS.staff.sarah,
      dayOfWeek: 6,
      windows: [{ start_time: '09:00', end_time: '14:00' }],
      confirm: true,
    });
    expect(confirmed.ok).toBe(true);

    const survivor = await getAppointmentById(booked.appointment.id);
    expect(survivor!.status).toBe('confirmed'); // never auto-cancelled
    expect(new Date(survivor!.starts_at).getTime()).toBe(at(saturday, '15:00').getTime());

    // New bookings do respect the narrowed hours.
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date: saturday,
      staffId: IDS.staff.sarah,
    });
    expect(labels(slots)).not.toContain('15:00');
  });

  it('saves silently when narrowing hours orphans nothing', async () => {
    const result = await setWorkingHours({
      businessId: IDS.business,
      staffId: IDS.staff.sarah,
      dayOfWeek: 6,
      windows: [{ start_time: '10:00', end_time: '13:00' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(0);
  });

  it('surfaces bookings that a new block would sit on top of, without cancelling them', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '14:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const preview = await addAvailabilityBlock({
      staffId: IDS.staff.sarah,
      startsAt: at(date, '13:00'),
      endsAt: at(date, '16:00'),
      reason: 'Training',
    });

    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].id).toBe(booked.appointment.id);

    // Nothing written yet.
    const blocks = await query('select id from availability_blocks');
    expect(blocks).toHaveLength(0);

    // Owner confirms: the block is created, the booking stays.
    const confirmed = await addAvailabilityBlock({
      staffId: IDS.staff.sarah,
      startsAt: at(date, '13:00'),
      endsAt: at(date, '16:00'),
      reason: 'Training',
      confirm: true,
    });
    expect(confirmed.ok).toBe(true);

    const survivor = await getAppointmentById(booked.appointment.id);
    expect(survivor!.status).toBe('confirmed');

    // But the window is closed to new bookings.
    const slots = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      date,
      staffId: IDS.staff.sarah,
    });
    expect(labels(slots)).not.toContain('14:00');
    expect(labels(slots)).not.toContain('13:00');
  });

  it('rejects a block that names both a staff member and a resource', async () => {
    const date = nextWorkingDate();
    await expect(
      addAvailabilityBlock({
        staffId: IDS.staff.sarah,
        resourceId: IDS.resource.massageRoom1,
        startsAt: at(date, '13:00'),
        endsAt: at(date, '14:00'),
      }),
    ).rejects.toThrow(/exactly one/i);
  });
});

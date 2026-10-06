import { beforeEach, describe, expect, it } from 'vitest';
import { createBooking, getAppointmentById } from '@/lib/booking';
import { createStaff, renameResource, renameService, renameStaff } from '@/lib/config-guards';
import { query } from '@/lib/db';
import { getActiveServices } from '@/lib/public-data';
import { IDS, at, nextWorkingDate, resetDatabase } from './helpers/fixtures';

beforeEach(resetDatabase);

/**
 * Renaming is how the owner turns the starter menu into her real one, so the
 * things that matter are: it cannot be used to reach another business's rows,
 * it cannot write junk, and it cannot disturb a booking already on the diary.
 */

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

describe('renaming a therapist', () => {
  it('saves the new name against the same row', async () => {
    const result = await renameStaff({
      businessId: IDS.business,
      staffId: IDS.staff.sarah,
      name: 'Sarah Mokoena',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe(IDS.staff.sarah);

    const [row] = await query<{ name: string }>('select name from staff where id = $1', [IDS.staff.sarah]);
    expect(row.name).toBe('Sarah Mokoena');
  });

  it('trims and collapses whitespace rather than storing it', async () => {
    await renameStaff({ businessId: IDS.business, staffId: IDS.staff.sarah, name: '  Sarah   Mokoena  ' });
    const [row] = await query<{ name: string }>('select name from staff where id = $1', [IDS.staff.sarah]);
    expect(row.name).toBe('Sarah Mokoena');
  });

  it('refuses a blank name and leaves the old one alone', async () => {
    const result = await renameStaff({ businessId: IDS.business, staffId: IDS.staff.sarah, name: '   ' });
    expect(result.ok).toBe(false);

    const [row] = await query<{ name: string }>('select name from staff where id = $1', [IDS.staff.sarah]);
    expect(row.name).toBe('Sarah');
  });

  it('refuses a name past the length limit', async () => {
    const result = await renameStaff({
      businessId: IDS.business,
      staffId: IDS.staff.sarah,
      name: 'x'.repeat(81),
    });
    expect(result.ok).toBe(false);
  });

  /**
   * The rename path runs on the pooled connection, which bypasses RLS by
   * design (§15). The business_id check in the guard is the only thing
   * standing between a caller and another tenant's rows, so it gets a test.
   */
  it('refuses a therapist belonging to another business', async () => {
    const result = await renameStaff({
      businessId: '00000000-0000-4000-8000-0000000000ff',
      staffId: IDS.staff.sarah,
      name: 'Hijacked',
    });
    expect(result.ok).toBe(false);

    const [row] = await query<{ name: string }>('select name from staff where id = $1', [IDS.staff.sarah]);
    expect(row.name).toBe('Sarah');
  });

  it('does not disturb a booking already on the diary', async () => {
    const date = nextWorkingDate();
    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await renameStaff({ businessId: IDS.business, staffId: IDS.staff.sarah, name: 'Sarah Mokoena' });

    const after = await getAppointmentById(booked.appointment.id);
    expect(after).not.toBeNull();
    expect(after!.staff_id).toBe(IDS.staff.sarah);
    expect(after!.price_cents_at_booking).toBe(booked.appointment.price_cents_at_booking);
    // The booking now reads through to the new name — names are display-only,
    // so there is nothing snapshotted to go stale.
    expect(after!.staff_name).toBe('Sarah Mokoena');
  });
});

describe('renaming a treatment or a room', () => {
  it('renames a treatment without touching its length or price', async () => {
    const result = await renameService({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      name: 'Signature Gel Overlay',
    });
    expect(result.ok).toBe(true);

    const [row] = await query<{ name: string; duration_minutes: number; price_cents: number }>(
      'select name, duration_minutes, price_cents from services where id = $1',
      [IDS.service.gelManicure],
    );
    expect(row.name).toBe('Signature Gel Overlay');
    expect(row.duration_minutes).toBe(45);
    expect(row.price_cents).toBe(25000);

    // And the public list reflects it immediately — /book and the assistant
    // both read this, so there is no second catalogue to keep in step.
    const services = await getActiveServices(IDS.business);
    expect(services.map((service) => service.name)).toContain('Signature Gel Overlay');
  });

  it('renames a room and keeps the services that use it', async () => {
    const before = await query('select 1 from service_resources where resource_id = $1', [
      IDS.resource.massageRoom1,
    ]);

    const result = await renameResource({
      businessId: IDS.business,
      resourceId: IDS.resource.massageRoom1,
      name: 'Treatment Room',
    });
    expect(result.ok).toBe(true);

    const [row] = await query<{ name: string }>('select name from resources where id = $1', [
      IDS.resource.massageRoom1,
    ]);
    expect(row.name).toBe('Treatment Room');

    const after = await query('select 1 from service_resources where resource_id = $1', [
      IDS.resource.massageRoom1,
    ]);
    expect(after).toHaveLength(before.length);
  });

  it('refuses a treatment belonging to another business', async () => {
    const result = await renameService({
      businessId: '00000000-0000-4000-8000-0000000000ff',
      serviceId: IDS.service.gelManicure,
      name: 'Hijacked',
    });
    expect(result.ok).toBe(false);
  });
});

describe('adding a therapist', () => {
  it('links her to every active treatment so she is not silently unbookable', async () => {
    const [{ n: activeServices }] = await query<{ n: number }>(
      'select count(*)::int as n from services where business_id = $1 and active',
      [IDS.business],
    );

    const result = await createStaff({ businessId: IDS.business, name: 'Zanele Dube' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.linkedServices).toBe(activeServices);

    const links = await query('select 1 from staff_services where staff_id = $1', [result.id]);
    expect(links).toHaveLength(activeServices);
  });

  it('leaves her with no working hours, and says so', async () => {
    const result = await createStaff({ businessId: IDS.business, name: 'Zanele Dube' });
    if (!result.ok) throw new Error('create failed');

    const hours = await query('select 1 from working_hours where staff_id = $1', [result.id]);
    expect(hours).toHaveLength(0);
    // The owner has to be told, or she has an invisible therapist and no reason why.
    expect(result.message).toMatch(/working hours/i);
  });

  it('lands in the business she is signed into, and is active', async () => {
    const result = await createStaff({ businessId: IDS.business, name: 'Zanele Dube' });
    if (!result.ok) throw new Error('create failed');

    const [row] = await query<{ business_id: string; active: boolean }>(
      'select business_id, active from staff where id = $1',
      [result.id],
    );
    expect(row.business_id).toBe(IDS.business);
    expect(row.active).toBe(true);
  });

  it('trims the name and refuses a blank one', async () => {
    const spaced = await createStaff({ businessId: IDS.business, name: '  Zanele   Dube ' });
    expect(spaced.ok).toBe(true);
    if (spaced.ok) {
      const [row] = await query<{ name: string }>('select name from staff where id = $1', [spaced.id]);
      expect(row.name).toBe('Zanele Dube');
    }

    expect((await createStaff({ businessId: IDS.business, name: '  ' })).ok).toBe(false);
  });
});

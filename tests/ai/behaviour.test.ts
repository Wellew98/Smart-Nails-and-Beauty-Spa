import { beforeEach, describe, expect, it } from 'vitest';
import { checkAvailability, getBusinessInfo, getServices, getStaff } from '@/lib/ai/tools';
import { query } from '@/lib/db';
import { IDS, nextWorkingDate, resetDatabase } from '../helpers/fixtures';

/**
 * The assistant follows the owner, not the code.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE WORTH TESTING WHEN THE TOOLS "OBVIOUSLY" READ THE DATABASE
 *
 * Because the cheap ways to build this all fail here, and all of them look
 * fine until the owner changes something. A price copied into the system
 * prompt, a treatment list cached at module scope, a hardcoded therapist name
 * in an example — each would pass every other test in this suite and then quote
 * last month's price to a paying customer, weeks after the owner "fixed" it in
 * Admin.
 *
 * Every one of these edits is one the owner can make in Admin > Setup this
 * afternoon. None of them involves a deployment, and none of them may.
 * ---------------------------------------------------------------------------
 */

beforeEach(resetDatabase);

const context = { businessId: IDS.business };

describe('an owner edit in Admin', () => {
  it('changes the price the assistant quotes', async () => {
    const before = await getServices(context);
    expect(before.services.find((s) => s.name === 'Gel Manicure')?.price).toBe('R250');

    await query('update services set price_cents = 31500 where id = $1', [IDS.service.gelManicure]);

    const after = await getServices(context);
    expect(after.services.find((s) => s.name === 'Gel Manicure')?.price).toBe('R315');
  });

  it('changes the opening hours the assistant reports', async () => {
    const before = await getBusinessInfo(context);
    expect(before.opening_hours.find((day) => day.day === 'Wednesday')).toMatchObject({
      closed: false,
    });

    await query('delete from working_hours where day_of_week = 3');

    const after = await getBusinessInfo(context);
    // Stated as closed, not merely absent — an absent day reads to a model as
    // "no information" and gets answered as "yes, we're open".
    expect(after.opening_hours.find((day) => day.day === 'Wednesday')).toMatchObject({
      closed: true,
    });
  });

  it('makes availability respect the new hours too', async () => {
    const date = nextWorkingDate(); // a Wednesday
    const before = await checkAvailability(context, { service_id: IDS.service.gelManicure, date });
    expect(before.ok && before.data.slots.length).toBeGreaterThan(0);

    await query('delete from working_hours where day_of_week = 3');

    const after = await checkAvailability(context, { service_id: IDS.service.gelManicure, date });
    // Not just reported as closed — actually unbookable, because the engine is
    // the single source and the assistant only ever asks it.
    expect(after.ok && after.data.slots).toHaveLength(0);
  });

  it('removes a therapist who has been deactivated', async () => {
    const before = await getStaff(context);
    expect(before.staff.map((member) => member.name)).toContain('Sarah');

    await query('update staff set active = false where id = $1', [IDS.staff.sarah]);

    const after = await getStaff(context);
    expect(after.staff.map((member) => member.name)).not.toContain('Sarah');

    // And she stops being bookable, not merely unlisted.
    const availability = await checkAvailability(context, {
      service_id: IDS.service.facial, // Sarah only
      date: nextWorkingDate(),
    });
    expect(availability.ok && availability.data.slots).toHaveLength(0);
  });

  it('removes a treatment that has been deactivated', async () => {
    await query('update services set active = false where id = $1', [IDS.service.pedicure]);

    const services = await getServices(context);
    expect(services.services.map((service) => service.name)).not.toContain('Pedicure');

    // And the id stops resolving, so a model working from a stale list cannot
    // book it either.
    const availability = await checkAvailability(context, {
      service_id: IDS.service.pedicure,
      date: nextWorkingDate(),
    });
    expect(availability.ok).toBe(false);
  });
});

describe('the treatment catalogue', () => {
  it('is read live, so an edit in Setup reaches the assistant with no re-sync', async () => {
    // There is deliberately no AI-specific service catalogue: the assistant
    // reads the same active rows the booking page does.
    await query(
      `insert into services (id, business_id, name, duration_minutes, price_cents, active)
       values ('eeeeeeee-0000-4000-8000-000000000001', $1, 'Brow Shape', 30, 10000, true)`,
      [IDS.business],
    );
    expect((await getServices(context)).services.map((s) => s.name)).toContain('Brow Shape');

    await query("update services set active = false where id = 'eeeeeeee-0000-4000-8000-000000000001'");
    expect((await getServices(context)).services.map((s) => s.name)).not.toContain('Brow Shape');
  });
});

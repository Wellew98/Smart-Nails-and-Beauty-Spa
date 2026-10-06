import { beforeEach, describe, expect, it } from 'vitest';
import { getAvailableSlots } from '@/lib/availability';
import { createBooking } from '@/lib/booking';
import { query } from '@/lib/db';
import { GeminiProvider } from '@/lib/ai/gemini';
import {
  checkAvailability,
  executeTool,
  getBusinessInfo,
  getServices,
  getStaff,
} from '@/lib/ai/tools';
import { IDS, at, labels, nextWorkingDate, resetDatabase } from '../helpers/fixtures';

/**
 * The four read-only tools (`lib/ai/tools.ts`), against real Postgres.
 *
 * Mocking the data layer here would assert nothing worth asserting. What these
 * tests are for is that the assistant reads the SAME rows the site renders and
 * gets the SAME answers the booking engine gives — and the only way to know
 * that is to ask the real engine and compare.
 */

beforeEach(resetDatabase);

const context = { businessId: IDS.business };
const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

// ---------------------------------------------------------------------------
// get_services
// ---------------------------------------------------------------------------

describe('get_services', () => {
  it('returns only the treatments currently offered', async () => {
    await query('update services set active = false where id = $1', [IDS.service.pedicure]);

    const { services } = await getServices(context);
    const names = services.map((service) => service.name);

    expect(names).toContain('Gel Manicure');
    expect(names).not.toContain('Pedicure');
    expect(services.every((service) => service.active)).toBe(true);
  });

  it('reads price and length from the row, formatted the way the site formats them', async () => {
    const { services } = await getServices(context);
    const massage = services.find((service) => service.id === IDS.service.fullBodyMassage);

    expect(massage).toMatchObject({
      name: 'Full Body Massage',
      duration_minutes: 60,
      duration: '1 hr',
      price_cents: 50000,
      price: 'R500',
    });
  });

  it('follows an owner edit with no code change', async () => {
    // The reason none of this is in the system prompt: she changes a price in
    // Admin > Setup and the assistant is right on the next message.
    await query('update services set price_cents = 55000 where id = $1', [
      IDS.service.fullBodyMassage,
    ]);

    const { services } = await getServices(context);
    expect(services.find((s) => s.id === IDS.service.fullBodyMassage)?.price).toBe('R550');
  });

  it('says which treatments need a room or a chair', async () => {
    const { services } = await getServices(context);
    const requires = new Map(services.map((s) => [s.id, s.requires_resource]));

    expect(requires.get(IDS.service.fullBodyMassage)).toBe(true);
    expect(requires.get(IDS.service.gelManicure)).toBe(false);
  });

  it('still says a treatment needs a room when every room is out of service', async () => {
    // §6's correction. "No service_resources rows" and "every row filtered out
    // by active" are different facts, and conflating them is what once made a
    // single room bookable without limit.
    await query('update resources set active = false');

    const { services } = await getServices(context);
    expect(services.find((s) => s.id === IDS.service.fullBodyMassage)?.requires_resource).toBe(true);
  });

  it('does not hand the model turnaround', async () => {
    // The customer is shown the treatment length; turnaround is calendar
    // occupancy (§4). Giving the model both invites it to quote the wrong one.
    const { services } = await getServices(context);
    expect(Object.keys(services[0])).not.toContain('turnaround_minutes');
  });
});

// ---------------------------------------------------------------------------
// get_staff
// ---------------------------------------------------------------------------

describe('get_staff', () => {
  it('returns a name, whether she is working, and what she does — and nothing else', async () => {
    await query("update staff set phone = '+27821110000', email = 'sarah@example.com' where id = $1", [
      IDS.staff.sarah,
    ]);

    const { staff } = await getStaff(context);
    const sarah = staff.find((member) => member.name === 'Sarah');

    expect(Object.keys(sarah!).sort()).toEqual(['active', 'name', 'services']);
    expect(JSON.stringify(staff)).not.toContain('+27821110000');
    expect(JSON.stringify(staff)).not.toContain('sarah@example.com');
  });

  it('gives out no internal ids', async () => {
    // A name is enough to ask about a therapist, and check_availability
    // resolves it server-side. An id the model can repeat is an id the model
    // can be talked into repeating somewhere else.
    const { staff } = await getStaff(context);
    expect(JSON.stringify(staff)).not.toContain(IDS.staff.sarah);
  });

  it('leaves out a therapist who is no longer working', async () => {
    await query('update staff set active = false where id = $1', [IDS.staff.lerato]);

    const { staff } = await getStaff(context);
    expect(staff.map((member) => member.name)).toEqual(['Nomsa', 'Sarah']);
  });

  it('lists the treatments she performs, and drops ones no longer offered', async () => {
    const before = await getStaff(context);
    expect(before.staff.find((m) => m.name === 'Sarah')?.services).toContain('Classic Facial');

    await query('update services set active = false where id = $1', [IDS.service.facial]);

    const after = await getStaff(context);
    expect(after.staff.find((m) => m.name === 'Sarah')?.services).not.toContain('Classic Facial');
  });
});

// ---------------------------------------------------------------------------
// get_business_info
// ---------------------------------------------------------------------------

describe('get_business_info', () => {
  it('reads the businesses row rather than a copy of it', async () => {
    // The NAP lives in one place. If this test can move it, nothing anywhere
    // else is holding a second copy.
    await query(
      "update businesses set name = 'Some Other Spa', address = '1 Nowhere Road', phone = '+27110000000' where id = $1",
      [IDS.business],
    );

    const info = await getBusinessInfo(context);
    expect(info.name).toBe('Some Other Spa');
    expect(info.address).toBe('1 Nowhere Road');
    expect(info.phone).toBe('011 000 0000');
  });

  it('gives the real NAP as configured', async () => {
    const info = await getBusinessInfo(context);
    expect(info.name).toBe('Smart Nails and Beauty Spa');
    expect(info.address).toBe('75 Amanda Avenue, Glenanda, Johannesburg South');
    expect(info.phone).toBe('081 044 4429');
    expect(info.timezone).toBe('Africa/Johannesburg');
  });

  it('states every day, so a closed day cannot be read as no information', async () => {
    const info = await getBusinessInfo(context);
    expect(info.opening_hours).toHaveLength(7);

    const byDay = new Map(info.opening_hours.map((entry) => [entry.day, entry]));
    // The fixture week is Tue–Sat (§13), deliberately not the real one.
    expect(byDay.get('Sunday')).toEqual({ day: 'Sunday', closed: true });
    expect(byDay.get('Monday')).toEqual({ day: 'Monday', closed: true });
    expect(byDay.get('Wednesday')).toMatchObject({ closed: false, opens: '09:00', closes: '17:00' });
    expect(byDay.get('Saturday')).toMatchObject({ closed: false, closes: '14:00' });
  });

  it('follows an owner edit to the hours', async () => {
    await query("update working_hours set end_time = '16:00' where day_of_week = 3");

    const info = await getBusinessInfo(context);
    const wednesday = info.opening_hours.find((entry) => entry.day === 'Wednesday');
    expect(wednesday).toMatchObject({ closes: '16:00' });
  });
});

// ---------------------------------------------------------------------------
// check_availability
// ---------------------------------------------------------------------------

describe('check_availability', () => {
  it('returns exactly what the availability engine returned, and nothing more', async () => {
    const date = nextWorkingDate();

    const engine = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
    });
    const result = await checkAvailability(context, {
      service_id: IDS.service.fullBodyMassage,
      date,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.slots.map((slot) => slot.time)).toEqual(labels(engine));
    // Times only — therapist names are client-side only. The resolved
    // (staff_id, resource_id) pair stays server-side — spec §6.
    expect(Object.keys(result.data.slots[0]).sort()).toEqual(['time']);
    expect(JSON.stringify(result.data)).not.toContain(IDS.resource.massageRoom1);
    expect(JSON.stringify(result.data)).not.toContain(IDS.staff.sarah);
  });

  it('respects turnaround, because it is the engine that answers', async () => {
    const date = nextWorkingDate();

    await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage, // 60 min + 15 turnaround
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });

    const result = await checkAvailability(context, {
      service_id: IDS.service.fullBodyMassage,
      date,
      staff_name: 'Sarah',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const times = result.data.slots.map((slot) => slot.time);
    expect(times).not.toContain('11:00');
    expect(times).toContain('11:15');
  });

  it('respects minimum notice', async () => {
    const date = nextWorkingDate();
    // Standing in the studio at 09:00 on the day, with two hours' notice
    // required (§13).
    const now = at(date, '09:00');

    const result = await checkAvailability(
      { ...context, now },
      { service_id: IDS.service.gelManicure, date },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const times = result.data.slots.map((slot) => slot.time);
    expect(times).not.toContain('09:00');
    expect(times).not.toContain('10:45');
    expect(times).toContain('11:00');
  });

  it('returns nothing on a closed day', async () => {
    // The fixture week is Tue–Sat, so Monday is closed.
    const date = nextWorkingDate();
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + 5); // Wednesday + 5 = Monday

    const result = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date: monday.toISOString().slice(0, 10),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slots).toEqual([]);
  });

  it('returns zero slots when a treatment needs a room and every room is inactive', async () => {
    // v2 §12.A test 12a, through the assistant's front door. The failure this
    // guards against is not "no slots" — it is a slot issued with resource_id
    // NULL, which never conflicts, so one room becomes bookable without limit.
    const date = nextWorkingDate();
    await query('update resources set active = false');

    const result = await checkAvailability(context, {
      service_id: IDS.service.fullBodyMassage,
      date,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.slots).toEqual([]);

    // And the engine underneath issued no slot at all, so there is none with a
    // null resource for the assistant to have offered.
    const engine = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
    });
    expect(engine).toEqual([]);

    // A treatment that genuinely needs no room is unaffected.
    const manicure = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date,
    });
    expect(manicure.ok && manicure.data.slots.length).toBeGreaterThan(0);
  });

  it('narrows to one therapist by name, never by id', async () => {
    const date = nextWorkingDate();

    const result = await checkAvailability(context, {
      service_id: IDS.service.facial, // Sarah only
      date,
      staff_name: 'sarah', // the model will not match her capitalisation
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Therapist filtering still works — checked via client projection.
    expect(result.client.options.every((opt) => opt.staffName === 'Sarah')).toBe(true);
  });

  it('rejects a therapist who does not exist rather than silently checking everyone', async () => {
    const result = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date: nextWorkingDate(),
      staff_name: 'Someone Invented',
    });

    expect(result).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('rejects a well-formed id that is not a treatment on offer', async () => {
    // A model can carry an id from an earlier conversation, or invent a
    // perfectly well-formed one.
    const invented = await checkAvailability(context, {
      service_id: '00000000-0000-4000-8000-0000000000ff',
      date: nextWorkingDate(),
    });
    expect(invented).toMatchObject({ ok: false, error: 'not_found' });

    await query('update services set active = false where id = $1', [IDS.service.pedicure]);
    const retired = await checkAvailability(context, {
      service_id: IDS.service.pedicure,
      date: nextWorkingDate(),
    });
    expect(retired).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('says when a date is outside the diary rather than saying nothing is free', async () => {
    const past = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date: '2020-01-01',
    });
    expect(past).toMatchObject({ ok: false, error: 'out_of_range' });

    const tooFar = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date: nextWorkingDate(400),
    });
    expect(tooFar).toMatchObject({ ok: false, error: 'out_of_range' });
  });
});

// ---------------------------------------------------------------------------
// Whatever is in the menu
// ---------------------------------------------------------------------------

describe('the treatment list', () => {
  it('reports whatever is active, with no separate AI catalogue', async () => {
    // The assistant reads the same rows /book does. When the owner renames a
    // treatment in Setup, the assistant says the new name on the next call —
    // there is nothing to re-sync.
    await query(
      `insert into services (id, business_id, name, duration_minutes, turnaround_minutes, price_cents, sort_order)
       values ('eeeeeeee-0000-4000-8000-000000000001', $1, 'Signature Overlay', 30, 0, 19900, 99)`,
      [IDS.business],
    );

    const after = await getServices(context);
    expect(after.services.map((service) => service.name)).toContain('Signature Overlay');

    await query(
      "update services set name = 'Renamed Overlay' where id = 'eeeeeeee-0000-4000-8000-000000000001'",
    );
    const renamed = await getServices(context);
    expect(renamed.services.map((service) => service.name)).toContain('Renamed Overlay');
    expect(renamed.services.map((service) => service.name)).not.toContain('Signature Overlay');
  });

  it('reports a newly added therapist without any extra wiring', async () => {
    await query(
      `insert into staff (id, business_id, name, active)
       values ('eeeeeeee-0000-4000-8000-000000000002', $1, 'Thandi', true)`,
      [IDS.business],
    );

    expect((await getStaff(context)).staff.map((member) => member.name)).toContain('Thandi');

    const availability = await checkAvailability(context, {
      service_id: IDS.service.gelManicure,
      date: nextWorkingDate(),
    });
    expect(availability.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// What actually reaches the model
// ---------------------------------------------------------------------------

describe('a tool result on its way to the provider', () => {
  it("keeps the studio's phone number, read from the row and sent intact", async () => {
    // The two halves of this are tested apart; this is the join, because the
    // bug it guards against lives only in the join. get_business_info reads a
    // real number out of the businesses row, the provider redacts phone-shaped
    // text, and a redactor that did not know whose number it was looking at
    // would quietly delete the one the whole site advertises.
    const info = await getBusinessInfo(context);
    expect(info.phone).toBe('081 044 4429');

    const sent: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await new GeminiProvider({ apiKey: 'k', model: 'm', fetchImpl }).generateResponse({
      systemPrompt: 'rules',
      messages: [
        { role: 'user', content: 'how do I reach you?' },
        { role: 'assistant', content: JSON.stringify(info) },
      ],
    });

    expect(sent[0]).toContain(info.phone);
  });
});

// ---------------------------------------------------------------------------
// Dispatch and validation
// ---------------------------------------------------------------------------

describe('executeTool', () => {
  it('runs a tool the model named correctly', async () => {
    const result = await executeTool('get_business_info', {}, context);
    expect(result).toMatchObject({ ok: true, tool: 'get_business_info' });
  });

  it('accepts a no-argument call with no arguments at all', async () => {
    // Gemini omits `args` entirely rather than sending {}.
    expect(await executeTool('get_services', undefined, context)).toMatchObject({ ok: true });
  });

  it('rejects a tool that does not exist', async () => {
    const result = await executeTool('cancel_everything', {}, context);
    expect(result).toMatchObject({ ok: false, error: 'unknown_tool' });
  });

  it('rejects arguments that do not validate, before touching the database', async () => {
    const cases: [string, unknown][] = [
      ['a service id that is not a uuid', { service_id: 'the massage one', date: '2026-08-12' }],
      ['a date in the wrong shape', { service_id: IDS.service.gelManicure, date: '12 August' }],
      ['a date that does not exist', { service_id: IDS.service.gelManicure, date: '2026-02-31' }],
      ['a missing date', { service_id: IDS.service.gelManicure }],
      [
        'an invented parameter',
        { service_id: IDS.service.gelManicure, date: '2026-08-12', customer_phone: '0825550101' },
      ],
    ];

    for (const [, args] of cases) {
      expect(await executeTool('check_availability', args, context)).toMatchObject({
        ok: false,
        error: 'invalid_arguments',
      });
    }
  });

  it('never echoes a rejected argument back into the message', async () => {
    // The message is handed to the model and may end up in a log. Quoting the
    // input back is how a bad argument becomes a bad log line.
    const result = await executeTool(
      'check_availability',
      { service_id: IDS.service.gelManicure, date: '2026-08-12', customer_phone: '0825550101' },
      context,
    );

    expect(JSON.stringify(result)).not.toContain('0825550101');
  });

  it('turns a data-layer failure into a result the model can read', async () => {
    // Nothing may throw out of here: an assistant that cannot reach the
    // database must not take down a booking page that can.
    const result = await executeTool('get_business_info', {}, {
      businessId: '00000000-0000-4000-8000-00000000dead',
    });

    expect(result).toMatchObject({ ok: false, error: 'unavailable' });
  });
});

describe('what the model is told about a treatment', () => {
  it('includes the price, so a direct price question can be answered', async () => {
    // Regression. This was once stripped to name-and-description, and
    // production answered "how much is a Hollywood wax?" with "the prices
    // aren't showing in what I pulled up. I'm sorry" — beside a card showing
    // R180. It is the most common question a salon is asked.
    const result = await executeTool('get_services', {}, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.data as { services: { name: string; price?: string; duration?: string }[] };
    const gel = data.services.find((service) => service.name === 'Gel Manicure');
    expect(gel?.price).toBe('R250');
    expect(gel?.duration).toBe('45 min');
  });

  it('still keeps the sample-data warning out of the model projection', async () => {
    // That one genuinely is the banner's job, and repeating it in prose was
    // the thing worth fixing.
    const result = await executeTool('get_services', {}, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.data)).not.toMatch(/sample|placeholder/i);
  });
});

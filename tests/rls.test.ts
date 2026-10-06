import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createBooking } from '@/lib/booking';
import { query } from '@/lib/db';
import { IDS, at, nextWorkingDate, resetDatabase } from './helpers/fixtures';
import { TEST_URL } from './helpers/config';

/**
 * Spec §9.8 — "With only the anon key, attempt to read `appointments` and to
 * insert one. Both must fail."
 *
 * The Supabase anon key is a JWT whose `role` claim is `anon`; PostgREST simply
 * runs the request as that Postgres role. Connecting directly and issuing
 * `set role anon` exercises the very same policies and grants the anon key
 * would hit, without needing a live Supabase project.
 */

const anon = new Client({ connectionString: TEST_URL });
const authed = new Client({ connectionString: TEST_URL });

await anon.connect();
await authed.connect();

afterAll(async () => {
  await anon.end();
  await authed.end();
});

beforeEach(resetDatabase);

/** Run `fn` as the anon role, always returning to the owner role afterwards. */
async function asAnon<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  await anon.query('set role anon');
  try {
    return await fn(anon);
  } finally {
    await anon.query('reset role');
  }
}

async function asUser<T>(userId: string, fn: (client: Client) => Promise<T>): Promise<T> {
  await authed.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', userId]);
  await authed.query('set role authenticated');
  try {
    return await fn(authed);
  } finally {
    await authed.query('reset role');
  }
}

async function seedOneBooking() {
  const date = nextWorkingDate();
  const result = await createBooking({
    businessId: IDS.business,
    serviceId: IDS.service.fullBodyMassage,
    staffId: IDS.staff.sarah,
    startsAt: at(date, '10:00'),
    name: 'Thandi Mahlangu',
    phone: '082 555 0101',
  });
  if (!result.ok) throw new Error('setup failed');
  return result.appointment;
}

describe('§9.8 RLS — the anon key', () => {
  it('cannot read appointments', async () => {
    await seedOneBooking();
    await expect(asAnon((c) => c.query('select * from appointments'))).rejects.toThrow(/permission denied/i);
  });

  it('cannot insert an appointment', async () => {
    await expect(
      asAnon((c) =>
        c.query(
          `insert into appointments (business_id, service_id, staff_id, customer_id,
                                     starts_at, ends_at, blocks_until, manage_token,
                                     price_cents_at_booking)
           values ($1,$2,$3,$4, now(), now() + interval '1 hour', now() + interval '1 hour',
                   'sneaky', 0)`,
          [IDS.business, IDS.service.fullBodyMassage, IDS.staff.sarah, IDS.business],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot read customers', async () => {
    await seedOneBooking();
    await expect(asAnon((c) => c.query('select * from customers'))).rejects.toThrow(/permission denied/i);
  });

  it('cannot read appointment_events or availability_blocks', async () => {
    await expect(asAnon((c) => c.query('select * from appointment_events'))).rejects.toThrow(/permission denied/i);
    await expect(asAnon((c) => c.query('select * from availability_blocks'))).rejects.toThrow(/permission denied/i);
  });

  /**
   * Vouchers build spec §6.2 / §8 test 8: "a voucher row is money, and a
   * readable table is a readable list of live codes." Same class as the
   * appointments/customers assertions above, on the two tables 0008 adds.
   */
  it('cannot read vouchers or voucher_transactions', async () => {
    const issued = await query<{ id: string }>(
      `insert into vouchers (business_id, code, code_lookup, lookup_token, initial_cents, balance_cents)
            values ($1, '4K2-P9X', '4K2P9X', 'test-lookup-token', 50000, 50000)
       returning id`,
      [IDS.business],
    );
    await query(
      `insert into voucher_transactions (voucher_id, kind, amount_cents) values ($1, 'issue', 50000)`,
      [issued[0].id],
    );

    await expect(asAnon((c) => c.query('select * from vouchers'))).rejects.toThrow(/permission denied/i);
    await expect(asAnon((c) => c.query('select * from voucher_transactions'))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('CAN read the public catalogue it needs to render the site', async () => {
    const result = await asAnon(async (c) => ({
      businesses: await c.query('select * from businesses'),
      services: await c.query('select * from services'),
      staff: await c.query('select * from staff'),
      resources: await c.query('select * from resources'),
      hours: await c.query('select * from working_hours'),
    }));

    expect(result.businesses.rows).toHaveLength(1);
    expect(result.services.rows).toHaveLength(5);
    expect(result.staff.rows).toHaveLength(3);
    expect(result.resources.rows).toHaveLength(3);
    expect(result.hours.rows.length).toBeGreaterThan(0);
  });

  it('cannot write to the public catalogue', async () => {
    await expect(
      asAnon((c) => c.query("update services set price_cents = 1 where id = $1", [IDS.service.fullBodyMassage])),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sees only active services and staff (§7)', async () => {
    await query('update services set active = false where id = $1', [IDS.service.facial]);
    await query('update staff set active = false where id = $1', [IDS.staff.lerato]);

    const result = await asAnon(async (c) => ({
      services: await c.query('select id from services'),
      staff: await c.query('select id from staff'),
    }));

    expect(result.services.rows).toHaveLength(4);
    expect(result.services.rows.map((r) => r.id)).not.toContain(IDS.service.facial);
    expect(result.staff.rows).toHaveLength(2);
  });
});

describe('§9.8 RLS — the authenticated owner', () => {
  const OWNER = '00000000-0000-4000-8000-00000000a001';
  const OUTSIDER = '00000000-0000-4000-8000-00000000a002';

  it('sees nothing until a membership row links them to a business', async () => {
    await seedOneBooking();
    const rows = await asUser(OUTSIDER, (c) => c.query('select * from appointments'));
    expect(rows.rows).toHaveLength(0);
  });

  it('sees their own business once linked', async () => {
    await seedOneBooking();
    await query('insert into business_members (user_id, business_id) values ($1,$2)', [OWNER, IDS.business]);

    const rows = await asUser(OWNER, (c) => c.query('select * from appointments'));
    expect(rows.rows).toHaveLength(1);
  });

  it('cannot see another business, and the scoping is in the policy not the query', async () => {
    await seedOneBooking();
    await query('insert into business_members (user_id, business_id) values ($1,$2)', [OWNER, IDS.business]);

    // A second spa with its own booking.
    const other = '00000000-0000-4000-8000-0000000000b2';
    await query(
      `insert into businesses (id, name, slug, phone) values ($1, 'Rival Spa', 'rival-spa', '+27820000000')`,
      [other],
    );
    await query('insert into business_members (user_id, business_id) values ($1,$2)', [OUTSIDER, other]);

    // The owner asks for EVERYTHING, with no business_id filter of her own.
    // The policy is what keeps the other spa's data out of the result.
    const rows = await asUser(OWNER, (c) => c.query('select business_id from appointments'));
    expect(rows.rows.every((r) => r.business_id === IDS.business)).toBe(true);

    const businesses = await asUser(OWNER, (c) => c.query('select id from businesses'));
    expect(businesses.rows).toHaveLength(1);
    expect(businesses.rows[0].id).toBe(IDS.business);
  });

  it('cannot write a row into another business', async () => {
    const other = '00000000-0000-4000-8000-0000000000b2';
    await query(
      `insert into businesses (id, name, slug, phone) values ($1, 'Rival Spa', 'rival-spa', '+27820000000')`,
      [other],
    );
    await query('insert into business_members (user_id, business_id) values ($1,$2)', [OWNER, IDS.business]);

    await expect(
      asUser(OWNER, (c) =>
        c.query(`insert into services (business_id, name, duration_minutes, price_cents)
                 values ($1, 'Sabotage', 30, 0)`, [other]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

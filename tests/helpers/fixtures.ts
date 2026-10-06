import { readFileSync } from 'node:fs';
import { getPool, query } from '@/lib/db';
import { zonedToUtc, type IsoDate } from '@/lib/time';

/** Fixed ids from supabase/seed.sql. */
export const IDS = {
  business: '00000000-0000-4000-8000-0000000000b1',
  service: {
    fullBodyMassage: '00000000-0000-4000-8000-000000000051', // 60 + 15 turnaround, R500
    backAndNeck: '00000000-0000-4000-8000-000000000052', // 30 + 10, R280
    facial: '00000000-0000-4000-8000-000000000053', // 45 + 10, R350 — Sarah only
    gelManicure: '00000000-0000-4000-8000-000000000054', // 45 + 5,  R250 — no resource
    pedicure: '00000000-0000-4000-8000-000000000055', // 60 + 10, R320 — chair
  },
  staff: {
    sarah: '00000000-0000-4000-8000-000000000021',
    nomsa: '00000000-0000-4000-8000-000000000022',
    lerato: '00000000-0000-4000-8000-000000000023',
  },
  resource: {
    massageRoom1: '00000000-0000-4000-8000-000000000031',
    massageRoom2: '00000000-0000-4000-8000-000000000032',
    pedicureChair: '00000000-0000-4000-8000-000000000033',
  },
} as const;

export const TZ = 'Africa/Johannesburg';

// The business row lives in migration 0003 (Supabase only deploys migrations),
// and truncating `businesses` cascades it away — so a reset has to re-apply both.
const businessSql = readFileSync(
  new URL('../../supabase/migrations/0003_business.sql', import.meta.url),
  'utf8',
);
const seedSql = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');

/**
 * Return the database to its seeded state. Truncating `businesses` cascades to
 * everything else, so no test can leak rows into the next one.
 */
export async function resetDatabase(): Promise<void> {
  const pool = getPool();
  await pool.query('truncate businesses restart identity cascade');
  await pool.query('truncate business_members');
  await pool.query(businessSql);
  await pool.query(seedSql);
}

/**
 * A Wednesday at least `minDaysAhead` days out — always a working day in the
 * seed (Tue–Sat) and comfortably past the 120-minute minimum notice.
 */
export function nextWorkingDate(minDaysAhead = 7): IsoDate {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minDaysAhead);
  // 3 = Wednesday
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** A Saturday, for the shorter 09:00–14:00 window. */
export function nextSaturday(minDaysAhead = 7): IsoDate {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minDaysAhead);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Wall-clock time on a given date, in the business timezone. */
export function at(date: IsoDate, time: string): Date {
  return zonedToUtc(date, time, TZ);
}

/** 'HH:MM' labels for the slots returned by the availability engine. */
export function labels(slots: { startsAt: Date }[]): string[] {
  return slots.map((slot) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(slot.startsAt),
  );
}

export async function countLiveAppointments(): Promise<number> {
  const rows = await query<{ count: string }>(
    "select count(*)::text as count from appointments where status in ('pending','confirmed')",
  );
  return Number(rows[0].count);
}

/**
 * The check that actually matters in test 12a (§12.A): has any appointment
 * been written with no resource for a service that requires one?
 *
 * `resource_id NULL` never conflicts with anything — `no_resource_overlap` is
 * an equality-plus-overlap exclusion, and NULL is not equal to NULL — so a row
 * like this is invisible to the constraint that is supposed to be the final
 * authority. That is precisely how one massage room was once bookable without
 * limit. Asks Postgres rather than trusting the availability engine, because
 * the engine is the thing under suspicion.
 */
export async function findResourcelessAppointments(): Promise<unknown[]> {
  return query(
    `select a.id, a.service_id, a.starts_at
       from appointments a
      where a.resource_id is null
        and exists (select 1 from service_resources sr where sr.service_id = a.service_id)`,
  );
}

/**
 * The check that actually matters in test 1: are there any two live
 * appointments whose occupancy ranges overlap on the same staff member or the
 * same resource? Asks Postgres directly rather than trusting the app.
 */
export async function findOverlappingPairs(): Promise<unknown[]> {
  return query(
    `select a.id as a_id, b.id as b_id, a.staff_id, a.resource_id
       from appointments a
       join appointments b
         on a.id < b.id
        and a.status in ('pending','confirmed')
        and b.status in ('pending','confirmed')
        and tstzrange(a.starts_at, a.blocks_until) && tstzrange(b.starts_at, b.blocks_until)
        and (a.staff_id = b.staff_id
             or (a.resource_id is not null and a.resource_id = b.resource_id))`,
  );
}

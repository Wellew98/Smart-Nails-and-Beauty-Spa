import 'server-only';
import { cache } from 'react';
import { query, queryOne } from './db';
import { BUSINESS_SLUG } from './site';
import type { Business, Resource, Service, Staff, WorkingHours } from './types';

/**
 * Read-only data for the public site. Everything here is rendered in server
 * components, so nothing reaches the browser but the finished HTML.
 *
 * These are the same tables the `anon` role may SELECT under RLS (§7); the
 * policies remain the safety net if this data is ever fetched with the anon
 * key from the browser, and tests/rls.test.ts holds them to it.
 *
 * `cache()` dedupes within a single render — the footer and the JSON-LD both
 * want the business row, and that should be one query.
 */

export const getBusiness = cache(async (slug: string = BUSINESS_SLUG): Promise<Business | null> => {
  return queryOne<Business>('select * from businesses where slug = $1', [slug]);
});

export const getActiveServices = cache(async (businessId: string): Promise<Service[]> => {
  return query<Service>(
    `select * from services
      where business_id = $1 and active
      order by sort_order, name`,
    [businessId],
  );
});

/** Includes inactive services — the admin needs to see them (§7.1). */
export const getAllServices = cache(async (businessId: string): Promise<Service[]> => {
  return query<Service>('select * from services where business_id = $1 order by sort_order, name', [businessId]);
});

export const getActiveStaff = cache(async (businessId: string): Promise<Staff[]> => {
  return query<Staff>('select * from staff where business_id = $1 and active order by name', [businessId]);
});

export const getAllStaff = cache(async (businessId: string): Promise<Staff[]> => {
  return query<Staff>('select * from staff where business_id = $1 order by name', [businessId]);
});

export const getAllResources = cache(async (businessId: string): Promise<Resource[]> => {
  return query<Resource>('select * from resources where business_id = $1 order by name', [businessId]);
});

/** Which therapists can perform a given treatment — drives the /book picker. */
export const getStaffForService = cache(async (serviceId: string): Promise<Staff[]> => {
  return query<Staff>(
    `select s.* from staff s
       join staff_services ss on ss.staff_id = s.id
      where ss.service_id = $1 and s.active
      order by s.name`,
    [serviceId],
  );
});

export const getWorkingHours = cache(async (businessId: string): Promise<WorkingHours[]> => {
  return query<WorkingHours>(
    `select wh.* from working_hours wh
       join staff s on s.id = wh.staff_id
      where s.business_id = $1 and s.active
      order by wh.day_of_week, wh.start_time`,
    [businessId],
  );
});

/**
 * The opening hours shown on the site and in JSON-LD: the union of every
 * active therapist's hours, since the studio is open if anyone is working.
 */
export const getOpeningHours = cache(
  async (businessId: string): Promise<{ day: number; opens: string; closes: string }[]> => {
    const rows = await query<{ day_of_week: number; opens: string; closes: string }>(
      `select wh.day_of_week,
              min(wh.start_time)::text as opens,
              max(wh.end_time)::text   as closes
         from working_hours wh
         join staff s on s.id = wh.staff_id
        where s.business_id = $1 and s.active
        group by wh.day_of_week
        order by wh.day_of_week`,
      [businessId],
    );
    return rows.map((row) => ({
      day: row.day_of_week,
      opens: row.opens.slice(0, 5),
      closes: row.closes.slice(0, 5),
    }));
  },
);

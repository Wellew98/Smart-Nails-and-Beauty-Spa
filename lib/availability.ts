import 'server-only';
import { getPool } from './db';
import {
  addMinutes,
  dayOfWeekInZone,
  daysBetween,
  todayInZone,
  wallTimeToMinutes,
  zonedToUtc,
  type IsoDate,
} from './time';
import type { Business, Queryable, Resource, Service, Slot, Staff } from './types';

/** Spec §4: "Step by 15 minutes, not by service duration." */
export const SLOT_STEP_MINUTES = 15;

export interface AvailabilityRequest {
  businessId: string;
  serviceId: string;
  date: IsoDate;
  /** null = "Anyone" */
  staffId?: string | null;
  /** Injectable for tests; defaults to real now. */
  now?: Date;
  /** Run inside an open transaction (used by the write path's re-check). */
  client?: Queryable;
}

interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

function overlaps(a: Interval, b: Interval): boolean {
  // Spec §4: existing_start < requested_end AND existing_end > requested_start.
  return a.start < b.end && a.end > b.start;
}

function db(client?: Queryable): Queryable {
  return client ?? getPool();
}

export async function getBusiness(businessId: string, client?: Queryable): Promise<Business | null> {
  const { rows } = await db(client).query('select * from businesses where id = $1', [businessId]);
  return (rows[0] as unknown as Business) ?? null;
}

export async function getService(serviceId: string, client?: Queryable): Promise<Service | null> {
  const { rows } = await db(client).query('select * from services where id = $1', [serviceId]);
  return (rows[0] as unknown as Service) ?? null;
}

/**
 * Spec §4. Returns the DISTINCT set of start times, each carrying the
 * (staff_id, resource_id) pair that would satisfy it.
 *
 * This list is ADVISORY. It can be stale the moment it is returned — the
 * exclusion constraints in the database are what actually guarantee
 * correctness (§4 closing note, §5 step 8).
 */
export async function getAvailableSlots(request: AvailabilityRequest): Promise<Slot[]> {
  const { businessId, serviceId, date, staffId = null, now = new Date(), client } = request;
  const conn = db(client);

  const business = await getBusiness(businessId, conn);
  if (!business) return [];
  const service = await getService(serviceId, conn);
  if (!service || !service.active || service.business_id !== businessId) return [];

  const tz = business.timezone;

  // ---- max advance (a whole-day rejection, so do it before any work) ----
  const today = todayInZone(tz, now);
  const daysOut = daysBetween(today, date);
  if (daysOut < 0 || daysOut > business.max_advance_days) return [];

  const occupancyMinutes = service.duration_minutes + service.turnaround_minutes;
  const earliestStartMs = now.getTime() + business.min_notice_minutes * 60_000;

  // ---- eligible staff (§4) ----
  const staffRows = await conn.query(
    `select s.*
       from staff s
       join staff_services ss on ss.staff_id = s.id
      where ss.service_id = $1
        and s.business_id = $2
        and s.active
        and ($3::uuid is null or s.id = $3::uuid)
      order by s.name, s.id`,
    [serviceId, businessId, staffId],
  );
  const eligibleStaff = staffRows.rows as unknown as Staff[];
  if (eligibleStaff.length === 0) return [];

  // ---- eligible resources (§4) ----
  const resourceRows = await conn.query(
    `select r.*
       from resources r
       join service_resources sr on sr.resource_id = r.id
      where sr.service_id = $1
        and r.business_id = $2
        and r.active
      order by r.name, r.id`,
    [serviceId, businessId],
  );
  const eligibleResources = resourceRows.rows as unknown as Resource[];

  /**
   * §4: "if the set is empty -> [null] (service needs no resource)".
   *
   * But "empty" has two very different causes, and conflating them is a
   * serious bug. The query above filters on r.active, so a service that DOES
   * require a room comes back empty once every room is out of service — and
   * treating that as "needs no resource" would book unlimited concurrent
   * massages with resource_id NULL, which never conflicts. §3's rule is about
   * services with no service_resources ROWS, not about a set emptied by
   * filtering.
   */
  const requiresResource = await conn.query(
    'select 1 from service_resources where service_id = $1 limit 1',
    [serviceId],
  );

  if (requiresResource.rows.length > 0 && eligibleResources.length === 0) {
    return []; // needs a room, and every one of them is inactive
  }

  const resourceCandidates: (string | null)[] =
    eligibleResources.length === 0 ? [null] : eligibleResources.map((r) => r.id);

  // ---- the day's window, widened so spill-over from adjacent days is seen ----
  const dayStart = zonedToUtc(date, '00:00', tz);
  const dayEnd = addMinutes(dayStart, 24 * 60);
  const scanFrom = addMinutes(dayStart, -24 * 60);
  const scanTo = addMinutes(dayEnd, 24 * 60);

  // ---- working hours for the weekday ----
  const dow = dayOfWeekInZone(date, tz);
  const staffIds = eligibleStaff.map((s) => s.id);
  const hoursRows = await conn.query(
    `select staff_id, start_time, end_time
       from working_hours
      where staff_id = any($1::uuid[])
        and day_of_week = $2
      order by start_time`,
    [staffIds, dow],
  );

  // ---- existing appointments (occupancy = starts_at .. blocks_until) ----
  const apptRows = await conn.query(
    `select staff_id, resource_id, starts_at, blocks_until
       from appointments
      where business_id = $1
        and status in ('pending','confirmed')
        and tstzrange(starts_at, blocks_until) && tstzrange($2, $3)`,
    [businessId, scanFrom.toISOString(), scanTo.toISOString()],
  );

  // ---- blocks (leave, closures, equipment out of service) ----
  const blockRows = await conn.query(
    `select b.staff_id, b.resource_id, b.starts_at, b.ends_at
       from availability_blocks b
       left join staff s   on s.id = b.staff_id
       left join resources r on r.id = b.resource_id
      where coalesce(s.business_id, r.business_id) = $1
        and tstzrange(b.starts_at, b.ends_at) && tstzrange($2, $3)`,
    [businessId, scanFrom.toISOString(), scanTo.toISOString()],
  );

  // ---- index the busy intervals by staff and by resource ----
  const busyByStaff = new Map<string, Interval[]>();
  const busyByResource = new Map<string, Interval[]>();

  const push = (map: Map<string, Interval[]>, key: string, interval: Interval) => {
    const list = map.get(key);
    if (list) list.push(interval);
    else map.set(key, [interval]);
  };

  for (const row of apptRows.rows as unknown as {
    staff_id: string;
    resource_id: string | null;
    starts_at: Date;
    blocks_until: Date;
  }[]) {
    const interval = { start: new Date(row.starts_at).getTime(), end: new Date(row.blocks_until).getTime() };
    push(busyByStaff, row.staff_id, interval);
    if (row.resource_id) push(busyByResource, row.resource_id, interval);
  }

  for (const row of blockRows.rows as unknown as {
    staff_id: string | null;
    resource_id: string | null;
    starts_at: Date;
    ends_at: Date;
  }[]) {
    const interval = { start: new Date(row.starts_at).getTime(), end: new Date(row.ends_at).getTime() };
    if (row.staff_id) push(busyByStaff, row.staff_id, interval);
    if (row.resource_id) push(busyByResource, row.resource_id, interval);
  }

  const isFree = (map: Map<string, Interval[]>, key: string, candidate: Interval): boolean => {
    const list = map.get(key);
    if (!list) return true;
    return !list.some((busy) => overlaps(busy, candidate));
  };

  // ---- walk the candidate grid ----
  // Deduplicated by start time: if two therapists are free at 10:00 the customer
  // sees one 10:00 (§4). Staff are ordered by name, so the choice is stable.
  const found = new Map<number, Slot>();

  for (const staff of eligibleStaff) {
    const windows = (hoursRows.rows as unknown as { staff_id: string; start_time: string; end_time: string }[]).filter(
      (w) => w.staff_id === staff.id,
    );

    for (const window of windows) {
      const windowStartMin = wallTimeToMinutes(window.start_time);
      const windowEndMin = wallTimeToMinutes(window.end_time);

      for (
        let minute = windowStartMin;
        minute + occupancyMinutes <= windowEndMin;
        minute += SLOT_STEP_MINUTES
      ) {
        const hh = String(Math.floor(minute / 60)).padStart(2, '0');
        const mm = String(minute % 60).padStart(2, '0');
        const startsAt = zonedToUtc(date, `${hh}:${mm}`, tz);
        const startMs = startsAt.getTime();

        // Already resolved by an earlier (alphabetically prior) staff member.
        if (found.has(startMs)) continue;

        // Spec §4: reject if start < now + min_notice_minutes.
        if (startMs < earliestStartMs) continue;

        const candidate: Interval = { start: startMs, end: startMs + occupancyMinutes * 60_000 };

        // Staff must be free of both appointments and blocks.
        if (!isFree(busyByStaff, staff.id, candidate)) continue;

        // "find the FIRST eligible resource with no overlapping appointment
        //  and no overlapping availability_block"
        let resolvedResource: string | null | undefined;
        for (const resourceId of resourceCandidates) {
          if (resourceId === null) {
            resolvedResource = null; // service needs no resource
            break;
          }
          if (isFree(busyByResource, resourceId, candidate)) {
            resolvedResource = resourceId;
            break;
          }
        }

        // "reject if a resource is required and none is free"
        if (resolvedResource === undefined) continue;

        found.set(startMs, { startsAt, staffId: staff.id, resourceId: resolvedResource });
      }
    }
  }

  return [...found.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Re-run §4 for one exact instant. This is step 2 of the write path (§5).
 *
 * Returns the resolved (staff, resource) pair, or null if the slot is not
 * bookable. A null here produces a good error message; it is NOT what makes
 * the system correct — the exclusion constraint is (§5 step 8).
 */
export async function resolveSlot(
  request: Omit<AvailabilityRequest, 'date'> & { startsAt: Date },
): Promise<Slot | null> {
  const { businessId, startsAt, client } = request;
  const business = await getBusiness(businessId, db(client));
  if (!business) return null;

  const { utcToZonedDate } = await import('./time');
  const date = utcToZonedDate(startsAt, business.timezone);

  const slots = await getAvailableSlots({ ...request, date });
  return slots.find((slot) => slot.startsAt.getTime() === startsAt.getTime()) ?? null;
}

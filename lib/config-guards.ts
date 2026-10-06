import 'server-only';
import { query, queryOne, withTransaction } from './db';
import { getBusiness } from './availability';
import { dayOfWeekInZone, utcToZonedDate, wallTimeToMinutes, zonedToUtc } from './time';
import type { AppointmentDetail } from './booking';

/**
 * Spec §7.1 — editing configuration when future bookings already exist.
 *
 * The rule: existing appointments are immutable snapshots. Config changes
 * affect FUTURE bookings only. Getting this wrong silently corrupts the
 * calendar, and the owner will not notice until a customer arrives to find
 * nobody expecting her.
 *
 * Nothing in here hard-deletes. Services, staff and resources are deactivated
 * via active = false so that history keeps resolving.
 */

const CONFLICT_SELECT = `
  select a.*,
         s.name  as service_name,
         s.duration_minutes as service_duration_minutes,
         st.name as staff_name,
         r.name  as resource_name,
         c.name  as customer_name,
         c.phone as customer_phone,
         c.email as customer_email,
         b.timezone as business_timezone,
         b.name  as business_name,
         b.phone as business_phone,
         b.whatsapp as business_whatsapp,
         b.min_notice_minutes
    from appointments a
    join services   s  on s.id  = a.service_id
    join staff      st on st.id = a.staff_id
    join customers  c  on c.id  = a.customer_id
    join businesses b  on b.id  = a.business_id
    left join resources r on r.id = a.resource_id
`;

/**
 * Spec §7.1's conflict detection query. Every "narrow hours" / "add block" /
 * "deactivate staff" save runs this first.
 */
export async function conflictsInWindow(options: {
  from: Date;
  to: Date;
  staffId?: string | null;
  resourceId?: string | null;
  serviceId?: string | null;
  now?: Date;
}): Promise<AppointmentDetail[]> {
  const { from, to, staffId = null, resourceId = null, serviceId = null, now = new Date() } = options;
  return query<AppointmentDetail>(
    `${CONFLICT_SELECT}
      where a.status in ('pending','confirmed')
        and a.starts_at >= $1
        and tstzrange($2, $3) && tstzrange(a.starts_at, a.blocks_until)
        and ($4::uuid is null or a.staff_id    = $4::uuid)
        and ($5::uuid is null or a.resource_id = $5::uuid)
        and ($6::uuid is null or a.service_id  = $6::uuid)
      order by a.starts_at`,
    [now.toISOString(), from.toISOString(), to.toISOString(), staffId, resourceId, serviceId],
  );
}

/** Everything still on the books for a person/resource/service from now on. */
export async function upcomingFor(options: {
  staffId?: string | null;
  resourceId?: string | null;
  serviceId?: string | null;
  now?: Date;
}): Promise<AppointmentDetail[]> {
  const { staffId = null, resourceId = null, serviceId = null, now = new Date() } = options;
  return query<AppointmentDetail>(
    `${CONFLICT_SELECT}
      where a.status in ('pending','confirmed')
        and a.starts_at >= $1
        and ($2::uuid is null or a.staff_id    = $2::uuid)
        and ($3::uuid is null or a.resource_id = $3::uuid)
        and ($4::uuid is null or a.service_id  = $4::uuid)
      order by a.starts_at`,
    [now.toISOString(), staffId, resourceId, serviceId],
  );
}

export type GuardResult<T = void> =
  | { ok: true; value: T; warnings: AppointmentDetail[] }
  | { ok: false; error: 'has_upcoming_bookings' | 'would_orphan_bookings'; conflicts: AppointmentDetail[]; message: string };

/**
 * §7.1: "Deactivate staff — Become orphaned, this is the dangerous one.
 * Block the save. List their upcoming bookings and require reassignment or
 * cancellation first."
 */
export async function deactivateStaff(staffId: string, now = new Date()): Promise<GuardResult> {
  const upcoming = await upcomingFor({ staffId, now });
  if (upcoming.length > 0) {
    return {
      ok: false,
      error: 'has_upcoming_bookings',
      conflicts: upcoming,
      message:
        `This therapist has ${upcoming.length} upcoming booking${upcoming.length === 1 ? '' : 's'}. ` +
        'Reassign or cancel them before making her inactive.',
    };
  }
  await query('update staff set active = false where id = $1', [staffId]);
  return { ok: true, value: undefined, warnings: [] };
}

/** §7.1: same treatment as staff — block, list, force resolution. */
export async function deactivateResource(resourceId: string, now = new Date()): Promise<GuardResult> {
  const upcoming = await upcomingFor({ resourceId, now });
  if (upcoming.length > 0) {
    return {
      ok: false,
      error: 'has_upcoming_bookings',
      conflicts: upcoming,
      message:
        `${upcoming.length} upcoming booking${upcoming.length === 1 ? ' uses' : 's use'} this. ` +
        'Move or cancel them before taking it out of service.',
    };
  }
  await query('update resources set active = false where id = $1', [resourceId]);
  return { ok: true, value: undefined, warnings: [] };
}

/**
 * §7.1: "Deactivate a service — Remain valid and must still appear in admin.
 * Warn: '3 upcoming bookings use this. They will go ahead.' Hide from /book."
 *
 * This one WARNS and proceeds. It does not block.
 */
export async function deactivateService(serviceId: string, now = new Date()): Promise<GuardResult> {
  const upcoming = await upcomingFor({ serviceId, now });
  await query('update services set active = false where id = $1', [serviceId]);
  return { ok: true, value: undefined, warnings: upcoming };
}

/**
 * §7.1: changing duration / price / turnaround saves silently. Existing
 * appointments keep their stored times and price_cents_at_booking, because
 * those are literal columns and nothing ever re-derives them from `services`.
 */
export async function updateService(
  serviceId: string,
  patch: Partial<Pick<
    import('./types').Service,
    'name' | 'description' | 'duration_minutes' | 'turnaround_minutes' | 'price_cents' | 'sort_order'
  >>,
): Promise<void> {
  const fields = Object.keys(patch);
  if (fields.length === 0) return;
  const assignments = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  await query(`update services set ${assignments} where id = $1`, [serviceId, ...fields.map((f) => (patch as Record<string, unknown>)[f])]);
}

// ---------------------------------------------------- naming (§7.1 additions)

const MAX_NAME_LENGTH = 80;

export type RenameResult =
  | { ok: true; id: string; message: string }
  | { ok: false; message: string };

/** Trim, collapse inner whitespace, and reject the empty / absurd cases. */
function cleanName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return { ok: false, message: 'A name cannot be blank.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, message: `That name is too long (${MAX_NAME_LENGTH} characters maximum).` };
  }
  return { ok: true, name };
}

/**
 * Rename a therapist, treatment or room.
 *
 * Names are display-only: nothing keys off them, and `appointments` stores the
 * times and price it was booked at rather than deriving them, so a rename can
 * never disturb the diary. Renaming is therefore the normal way the owner
 * edits her menu and her team — including the starter rows the project shipped
 * with.
 *
 * The tenancy check is the load-bearing part. These run through the pooled
 * connection, which bypasses RLS by design (§15), so the business_id has to be
 * asserted here.
 */
async function rename(
  table: 'staff' | 'services' | 'resources',
  label: string,
  options: { businessId: string; id: string; name: string },
): Promise<RenameResult> {
  const cleaned = cleanName(options.name);
  if (!cleaned.ok) return cleaned;

  // Table name is from a closed union, never from the request body.
  const existing = await queryOne<{ business_id: string }>(
    `select business_id from ${table} where id = $1`,
    [options.id],
  );
  if (!existing || existing.business_id !== options.businessId) {
    return { ok: false, message: `That ${label} does not belong to this business.` };
  }

  await query(`update ${table} set name = $2 where id = $1`, [options.id, cleaned.name]);
  return { ok: true, id: options.id, message: 'Name saved.' };
}

export async function renameStaff(options: {
  businessId: string;
  staffId: string;
  name: string;
}): Promise<RenameResult> {
  return rename('staff', 'therapist', {
    businessId: options.businessId,
    id: options.staffId,
    name: options.name,
  });
}

export async function renameService(options: {
  businessId: string;
  serviceId: string;
  name: string;
}): Promise<RenameResult> {
  return rename('services', 'treatment', {
    businessId: options.businessId,
    id: options.serviceId,
    name: options.name,
  });
}

export async function renameResource(options: {
  businessId: string;
  resourceId: string;
  name: string;
}): Promise<RenameResult> {
  return rename('resources', 'room', {
    businessId: options.businessId,
    id: options.resourceId,
    name: options.name,
  });
}

export type CreateStaffResult =
  | { ok: true; id: string; linkedServices: number; message: string }
  | { ok: false; message: string };

/**
 * Add a therapist.
 *
 * She is linked to every currently active treatment, because there is no UI for
 * staff_services and the alternative default — linked to nothing — produces a
 * therapist who exists, looks fine in Setup, and silently never appears on
 * /book. All-treatments is the wrong default for a large salon and the only
 * safe one here.
 *
 * She still has no working_hours, so she genuinely is not bookable until those
 * are set. That is real, not a bug, and the caller must say so out loud.
 */
export async function createStaff(options: {
  businessId: string;
  name: string;
}): Promise<CreateStaffResult> {
  const cleaned = cleanName(options.name);
  if (!cleaned.ok) return cleaned;
  const { name } = cleaned;

  return withTransaction(async (client) => {
    const inserted = await client.query(
      'insert into staff (business_id, name) values ($1, $2) returning id',
      [options.businessId, name],
    );
    const id = (inserted.rows[0] as { id: string }).id;

    const linked = await client.query(
      `insert into staff_services (staff_id, service_id)
       select $1, s.id from services s where s.business_id = $2 and s.active`,
      [id, options.businessId],
    );

    return {
      ok: true as const,
      id,
      linkedServices: linked.rowCount ?? 0,
      message: `${name} added, and set to do every treatment. Set her working hours below — until you do, she will not be offered on the booking page.`,
    };
  });
}

export interface HoursWindow {
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
}

/**
 * §7.1: "Narrow working hours — Bookings now fall outside hours. Show the
 * conflicting bookings before saving. Owner chooses: keep them, or cancel and
 * notify. NEVER auto-cancel."
 *
 * Call with confirm=false to preview. If conflicts come back, the UI shows
 * them; calling again with confirm=true saves the hours and LEAVES the
 * bookings alone.
 */
export async function setWorkingHours(options: {
  businessId: string;
  staffId: string;
  dayOfWeek: number;
  windows: HoursWindow[];
  confirm?: boolean;
  now?: Date;
}): Promise<GuardResult> {
  const { businessId, staffId, dayOfWeek, windows, confirm = false, now = new Date() } = options;

  const business = await getBusiness(businessId);
  if (!business) throw new Error(`Unknown business ${businessId}`);
  const tz = business.timezone;

  // Which future bookings would no longer sit inside a working window?
  const upcoming = await upcomingFor({ staffId, now });
  const orphaned = upcoming.filter((appointment) => {
    const startsAt = new Date(appointment.starts_at);
    const date = utcToZonedDate(startsAt, tz);
    if (dayOfWeekInZone(date, tz) !== dayOfWeek) return false;

    const blocksUntil = new Date(appointment.blocks_until);
    // Fits if some window fully contains [starts_at, blocks_until).
    return !windows.some((window) => {
      const windowStart = zonedToUtc(date, window.start_time, tz).getTime();
      const windowEnd = zonedToUtc(date, window.end_time, tz).getTime();
      return startsAt.getTime() >= windowStart && blocksUntil.getTime() <= windowEnd;
    });
  });

  if (orphaned.length > 0 && !confirm) {
    return {
      ok: false,
      error: 'would_orphan_bookings',
      conflicts: orphaned,
      message:
        `${orphaned.length} booking${orphaned.length === 1 ? '' : 's'} would fall outside the new hours. ` +
        'Keep them as they are, or cancel them. Nothing is cancelled automatically.',
    };
  }

  await withTransaction(async (client) => {
    await client.query('delete from working_hours where staff_id = $1 and day_of_week = $2', [staffId, dayOfWeek]);
    for (const window of windows) {
      if (wallTimeToMinutes(window.end_time) <= wallTimeToMinutes(window.start_time)) {
        throw new Error(`Working hours must end after they start: ${window.start_time}–${window.end_time}`);
      }
      await client.query(
        'insert into working_hours (staff_id, day_of_week, start_time, end_time) values ($1,$2,$3,$4)',
        [staffId, dayOfWeek, window.start_time, window.end_time],
      );
    }
  });

  // The bookings survive untouched. That is the point.
  return { ok: true, value: undefined, warnings: orphaned };
}

/**
 * §7.1: "Add a block over existing bookings — Conflict. List them, owner
 * decides." Same preview-then-confirm shape as hours.
 */
export async function addAvailabilityBlock(options: {
  staffId?: string | null;
  resourceId?: string | null;
  startsAt: Date;
  endsAt: Date;
  reason?: string | null;
  confirm?: boolean;
  now?: Date;
}): Promise<GuardResult<{ id: string }>> {
  const { staffId = null, resourceId = null, startsAt, endsAt, reason = null, confirm = false, now = new Date() } = options;

  if ((staffId === null) === (resourceId === null)) {
    throw new Error('A block must name exactly one of staffId or resourceId.');
  }

  const conflicts = await conflictsInWindow({ from: startsAt, to: endsAt, staffId, resourceId, now });
  if (conflicts.length > 0 && !confirm) {
    return {
      ok: false,
      error: 'would_orphan_bookings',
      conflicts,
      message:
        `${conflicts.length} booking${conflicts.length === 1 ? '' : 's'} already sit inside that window. ` +
        'Blocking the time does not cancel them.',
    };
  }

  const rows = await query<{ id: string }>(
    `insert into availability_blocks (staff_id, resource_id, starts_at, ends_at, reason)
          values ($1,$2,$3,$4,$5) returning id`,
    [staffId, resourceId, startsAt.toISOString(), endsAt.toISOString(), reason],
  );

  return { ok: true, value: rows[0], warnings: conflicts };
}

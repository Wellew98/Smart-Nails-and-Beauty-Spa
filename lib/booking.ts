import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  isExclusionViolation,
  isUniqueViolation,
  lockBusinessForWrite,
  violatedConstraint,
  withTransaction,
  query,
  queryOne,
} from './db';
import { getAvailableSlots, getBusiness, getService, resolveSlot } from './availability';
import { normalisePhone } from './phone';
import { addMinutes, utcToZonedDate } from './time';
import { eraseVoucherPersonalData, refundVoucherRedemptionsForAppointment } from './vouchers';
import type { Appointment, BookingSource, Customer, Queryable, Slot } from './types';

/** Spec §5 step 6: crypto random, 32 bytes, url-safe. */
function generateManageToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreateBookingInput {
  businessId: string;
  serviceId: string;
  /** null = "Anyone". Required when source is 'admin' or 'walkin'. */
  staffId?: string | null;
  startsAt: Date;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  source?: BookingSource;
  /** Injectable for tests. */
  now?: Date;
}

export type BookingFailure =
  | { ok: false; error: 'slot_taken'; slots: Slot[]; clashesWith: ClashSummary[]; message: string }
  | { ok: false; error: 'invalid_phone'; message: string }
  | { ok: false; error: 'unknown_service'; message: string }
  | { ok: false; error: 'staff_required'; message: string };

/**
 * What a rejected write collided with. Spec §7.1: when the constraint rejects
 * the owner's edit, "show her what it clashes with" — a bare refusal leaves her
 * guessing which of her own bookings is in the way.
 */
export interface ClashSummary {
  appointment_id: string;
  starts_at: Date;
  blocks_until: Date;
  service_name: string;
  staff_name: string;
  resource_name: string | null;
  customer_name: string;
  customer_phone: string;
  /** Which of the two exclusion constraints this row would violate. */
  reason: 'staff' | 'resource';
}

async function findClashes(options: {
  businessId: string;
  staffId: string | null;
  resourceId: string | null;
  startsAt: Date;
  blocksUntil: Date;
  excludeAppointmentId?: string | null;
}): Promise<ClashSummary[]> {
  const { businessId, staffId, resourceId, startsAt, blocksUntil, excludeAppointmentId = null } = options;
  return query<ClashSummary>(
    `select a.id as appointment_id,
            a.starts_at, a.blocks_until,
            s.name  as service_name,
            st.name as staff_name,
            r.name  as resource_name,
            c.name  as customer_name,
            c.phone as customer_phone,
            case when a.staff_id = $2::uuid then 'staff' else 'resource' end as reason
       from appointments a
       join services  s  on s.id  = a.service_id
       join staff     st on st.id = a.staff_id
       join customers c  on c.id  = a.customer_id
       left join resources r on r.id = a.resource_id
      where a.business_id = $1
        and a.status in ('pending','confirmed')
        and ($6::uuid is null or a.id <> $6::uuid)
        and tstzrange(a.starts_at, a.blocks_until) && tstzrange($4, $5)
        and (a.staff_id = $2::uuid
             or ($3::uuid is not null and a.resource_id = $3::uuid))
      order by a.starts_at`,
    [
      businessId,
      staffId,
      resourceId,
      startsAt.toISOString(),
      blocksUntil.toISOString(),
      excludeAppointmentId,
    ],
  );
}

export type BookingResult =
  | { ok: true; appointment: Appointment; replayed: boolean }
  | BookingFailure;

class SlotUnavailable extends Error {
  constructor() {
    super('slot_unavailable');
    this.name = 'SlotUnavailable';
  }
}

/**
 * Resolve a slot for an owner-entered booking (walk-in or admin move).
 *
 * The owner books people standing at the counter, so working hours and minimum
 * notice do not apply — but double-booking checks absolutely do. Spec §7.1:
 * "The owner is not exempt from double-booking checks — she is the most likely
 * person to cause one." We resolve a free resource here and let the exclusion
 * constraints have the final word either way.
 */
async function resolveSlotForOwner(
  client: Queryable,
  businessId: string,
  serviceId: string,
  staffId: string,
  startsAt: Date,
  occupancyMinutes: number,
): Promise<Slot> {
  const endsAt = addMinutes(startsAt, occupancyMinutes);

  const { rows } = await client.query(
    `select r.id
       from resources r
       join service_resources sr on sr.resource_id = r.id
      where sr.service_id = $1
        and r.business_id = $2
        and r.active
        and not exists (
          select 1 from appointments a
           where a.resource_id = r.id
             and a.status in ('pending','confirmed')
             and tstzrange(a.starts_at, a.blocks_until) && tstzrange($3, $4)
        )
        and not exists (
          select 1 from availability_blocks b
           where b.resource_id = r.id
             and tstzrange(b.starts_at, b.ends_at) && tstzrange($3, $4)
        )
      order by r.name, r.id
      limit 1`,
    [serviceId, businessId, startsAt.toISOString(), endsAt.toISOString()],
  );

  if (rows.length > 0) {
    return { startsAt, staffId, resourceId: rows[0].id as string };
  }

  // Either the service needs no resource, or every one of them is busy. Tell
  // those two cases apart — the second must not silently become "no resource".
  const requires = await client.query(
    'select 1 from service_resources where service_id = $1 limit 1',
    [serviceId],
  );
  if (requires.rows.length > 0) throw new SlotUnavailable();

  return { startsAt, staffId, resourceId: null };
}

/**
 * The booking write path — spec §5.
 *
 * Step 2 (re-check availability) and step 8 (catch SQLSTATE 23P01) are BOTH
 * implemented. Step 2 gives a good error message in the common case; step 8 is
 * what actually guarantees correctness when two people tap the same slot a
 * millisecond apart. Implementing only one of them is the bug this whole spec
 * exists to prevent.
 */
export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const {
    businessId,
    serviceId,
    staffId = null,
    startsAt,
    name,
    email = null,
    notes = null,
    idempotencyKey = null,
    source = 'web',
    now = new Date(),
  } = input;

  const ownerEntered = source === 'admin' || source === 'walkin';
  if (ownerEntered && !staffId) {
    return { ok: false, error: 'staff_required', message: 'Choose which therapist this booking is for.' };
  }

  // ---- step 1: normalise phone to E.164 ----
  let phone: string;
  try {
    phone = normalisePhone(input.phone);
  } catch {
    return {
      ok: false,
      error: 'invalid_phone',
      message: 'That does not look like a South African mobile number.',
    };
  }

  const service = await getService(serviceId);
  if (!service || service.business_id !== businessId) {
    return { ok: false, error: 'unknown_service', message: 'That treatment is no longer offered.' };
  }
  const occupancyMinutes = service.duration_minutes + service.turnaround_minutes;

  // ---- idempotency fast path (§5: "Mobile users double-tap. Handle it.") ----
  // Cheap check for the common case: the repeat arrives after the original
  // finished. The authoritative check is inside the transaction below.
  if (idempotencyKey) {
    const existing = await queryOne<Appointment>(
      'select * from appointments where business_id = $1 and idempotency_key = $2',
      [businessId, idempotencyKey],
    );
    if (existing) return { ok: true, appointment: existing, replayed: true };
  }

  // Captured out here so the catch block can describe what we tried to book
  // after the transaction has rolled back.
  let attempted: Slot | null = null;
  let replayed = false;

  try {
    const appointment = await withTransaction(async (client) => {
      // Before anything else. Also means the §4 re-check below runs inside the
      // critical section, so step 2 is exact rather than advisory here.
      await lockBusinessForWrite(client, businessId);

      // ---- idempotency, authoritatively ----
      // A true double-tap has both requests in flight at once, so neither sees
      // the other on the fast path above. Whichever wins the lock inserts; the
      // other arrives here and MUST return that same appointment. Checking
      // after the lock (and before availability) is what makes that work — by
      // this point the winner has committed, so an availability check would
      // otherwise report the customer's own booking as "slot taken".
      if (idempotencyKey) {
        const existing = await client.query(
          'select * from appointments where business_id = $1 and idempotency_key = $2',
          [businessId, idempotencyKey],
        );
        if (existing.rows.length > 0) {
          replayed = true;
          return existing.rows[0] as unknown as Appointment;
        }
      }

      // ---- steps 2 + 3: re-run §4 for this exact slot, resolve staff/resource ----
      const resolved = ownerEntered
        ? await resolveSlotForOwner(client, businessId, serviceId, staffId!, startsAt, occupancyMinutes)
        : await resolveSlot({ businessId, serviceId, staffId, startsAt, now, client });

      if (!resolved) throw new SlotUnavailable();
      attempted = resolved;

      // ---- step 4: derive the stored times ----
      const endsAt = addMinutes(startsAt, service.duration_minutes);
      const blocksUntil = addMinutes(endsAt, service.turnaround_minutes);

      // ---- step 5: upsert the customer on (business_id, phone) ----
      const customerRows = await client.query(
        `insert into customers (business_id, name, phone, email)
              values ($1, $2, $3, $4)
         on conflict (business_id, phone) do update
                set name  = excluded.name,
                    email = coalesce(excluded.email, customers.email)
           returning *`,
        [businessId, name.trim(), phone, email],
      );
      const customerId = customerRows.rows[0].id as string;

      // ---- steps 6 + 7: token, then INSERT ----
      const manageToken = generateManageToken();
      const inserted = await client.query(
        `insert into appointments (
            business_id, service_id, staff_id, resource_id, customer_id,
            starts_at, ends_at, blocks_until,
            status, source, manage_token, price_cents_at_booking, notes, idempotency_key
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,$12,$13)
           returning *`,
        [
          businessId,
          serviceId,
          resolved.staffId,
          resolved.resourceId,
          customerId,
          startsAt.toISOString(),
          endsAt.toISOString(),
          blocksUntil.toISOString(),
          source,
          manageToken,
          // §7.1: price is snapshotted, never re-derived from services later.
          service.price_cents,
          notes,
          idempotencyKey,
        ],
      );
      const row = inserted.rows[0] as unknown as Appointment;

      // ---- step 9: audit ----
      await client.query(
        `insert into appointment_events (appointment_id, event, actor, detail)
              values ($1, 'created', $2, $3)`,
        [
          row.id,
          ownerEntered ? 'admin' : 'customer',
          JSON.stringify({ source, service: service.name, price_cents: service.price_cents }),
        ],
      );

      return row;
    });

    return { ok: true, appointment, replayed };
  } catch (error) {
    // ---- step 8: the constraint refused the overlap ----
    if (isExclusionViolation(error) || error instanceof SlotUnavailable) {
      const tried = attempted as Slot | null;
      return {
        ok: false,
        error: 'slot_taken',
        slots: await freshSlotsFor(businessId, serviceId, startsAt, staffId, now),
        clashesWith: tried
          ? await findClashes({
              businessId,
              staffId: tried.staffId,
              resourceId: tried.resourceId,
              startsAt,
              blocksUntil: addMinutes(startsAt, occupancyMinutes),
            })
          : [],
        message: 'Sorry, that time was taken while you were booking. Here are the times still open.',
      };
    }

    // A concurrent request with the same idempotency key won the race. The
    // other one's row is the answer; return it rather than erroring.
    if (isUniqueViolation(error) && violatedConstraint(error)?.includes('idempotency') && idempotencyKey) {
      const existing = await queryOne<Appointment>(
        'select * from appointments where business_id = $1 and idempotency_key = $2',
        [businessId, idempotencyKey],
      );
      if (existing) return { ok: true, appointment: existing, replayed: true };
    }

    throw error;
  }
}

/** The fresh slot list that accompanies a 409 (§5 step 8). */
async function freshSlotsFor(
  businessId: string,
  serviceId: string,
  startsAt: Date,
  staffId: string | null,
  now: Date,
): Promise<Slot[]> {
  const business = await getBusiness(businessId);
  if (!business) return [];
  const date = utcToZonedDate(startsAt, business.timezone);
  return getAvailableSlots({ businessId, serviceId, date, staffId, now });
}

// ---------------------------------------------------------------------------
// Cancel — spec §6
// ---------------------------------------------------------------------------

export type CancelResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; error: 'not_found' | 'already_cancelled' | 'too_late'; message: string };

export async function cancelBooking(options: {
  appointmentId: string;
  actor: 'customer' | 'admin' | 'system';
  reason?: string | null;
  now?: Date;
}): Promise<CancelResult> {
  const { appointmentId, actor, reason = null, now = new Date() } = options;

  const appointment = await queryOne<Appointment>('select * from appointments where id = $1', [appointmentId]);
  if (!appointment) return { ok: false, error: 'not_found', message: 'That booking could not be found.' };

  if (appointment.status === 'cancelled') {
    return { ok: false, error: 'already_cancelled', message: 'That booking is already cancelled.' };
  }

  // §6: customers may cancel up to min_notice_minutes before the start.
  // The owner is not bound by that — she cancels on the customer's behalf.
  if (actor === 'customer') {
    const business = await getBusiness(appointment.business_id);
    const cutoff = new Date(appointment.starts_at).getTime() - (business?.min_notice_minutes ?? 0) * 60_000;
    if (now.getTime() > cutoff) {
      return {
        ok: false,
        error: 'too_late',
        message: 'It is too close to your appointment to cancel online. Please phone or WhatsApp us.',
      };
    }
  }

  const updated = await withTransaction(async (client) => {
    await lockBusinessForWrite(client, appointment.business_id);

    const rows = await client.query(
      `update appointments
          set status = 'cancelled', cancelled_at = now()
        where id = $1
          and status in ('pending','confirmed')
        returning *`,
      [appointmentId],
    );
    if (rows.rows.length === 0) return null;

    await client.query(
      `insert into appointment_events (appointment_id, event, actor, detail)
            values ($1, 'cancelled', $2, $3)`,
      [appointmentId, actor, JSON.stringify({ reason })],
    );

    // Vouchers build spec §3: "the redemption is refunded, not deleted."
    // Already inside the transaction that holds the business lock, so this is
    // just another write on the same queue — no new locking.
    await refundVoucherRedemptionsForAppointment(client, appointmentId, actor);

    return rows.rows[0] as unknown as Appointment;
  });

  if (!updated) return { ok: false, error: 'already_cancelled', message: 'That booking is already cancelled.' };
  return { ok: true, appointment: updated };
}

// ---------------------------------------------------------------------------
// Reschedule — spec §6
// ---------------------------------------------------------------------------

export type RescheduleResult =
  | { ok: true; appointment: Appointment; previousId: string }
  | { ok: false; error: 'not_found' | 'too_late'; message: string }
  | { ok: false; error: 'slot_taken'; slots: Slot[]; clashesWith: ClashSummary[]; message: string };

/**
 * Move a booking. Spec §6: "cancels the old row and creates a new one in one
 * transaction, preserving customer_id".
 *
 * Two things here are easy to get wrong:
 *
 *  1. The old row is cancelled BEFORE the new slot is resolved and inserted.
 *     Otherwise moving a 10:00 booking to 10:15 collides with ITSELF — the old
 *     row still occupies the range the new one wants. Cancelling first removes
 *     it from the exclusion constraints' partial index inside the same
 *     transaction, so the move succeeds and a genuine clash still fails.
 *
 *  2. The customer's manage link must keep working, so the original
 *     manage_token moves to the new row and the cancelled row gets a fresh
 *     one. manage_token is unique, hence the rotation rather than a copy.
 */
export async function rescheduleBooking(options: {
  appointmentId: string;
  startsAt: Date;
  staffId?: string | null;
  actor: 'customer' | 'admin';
  now?: Date;
}): Promise<RescheduleResult> {
  const { appointmentId, startsAt, staffId = null, actor, now = new Date() } = options;

  const original = await queryOne<Appointment>('select * from appointments where id = $1', [appointmentId]);
  if (!original || !['pending', 'confirmed'].includes(original.status)) {
    return { ok: false, error: 'not_found', message: 'That booking could not be found.' };
  }

  if (actor === 'customer') {
    const business = await getBusiness(original.business_id);
    const cutoff = new Date(original.starts_at).getTime() - (business?.min_notice_minutes ?? 0) * 60_000;
    if (now.getTime() > cutoff) {
      return {
        ok: false,
        error: 'too_late',
        message: 'It is too close to your appointment to move it online. Please phone or WhatsApp us.',
      };
    }
  }

  const service = await getService(original.service_id);
  if (!service) return { ok: false, error: 'not_found', message: 'That treatment is no longer offered.' };
  const occupancyMinutes = service.duration_minutes + service.turnaround_minutes;

  let attempted: Slot | null = null;

  try {
    const result = await withTransaction(async (client) => {
      await lockBusinessForWrite(client, original.business_id);

      // (1) Free the old row first — see the note above.
      await client.query(
        `update appointments
            set status = 'cancelled', cancelled_at = now(), manage_token = $2
          where id = $1`,
        [appointmentId, generateManageToken()],
      );

      // Now resolve against a calendar that no longer contains this booking.
      const resolved =
        actor === 'admin'
          ? await resolveSlotForOwner(
              client,
              original.business_id,
              original.service_id,
              staffId ?? original.staff_id,
              startsAt,
              occupancyMinutes,
            )
          : await resolveSlot({
              businessId: original.business_id,
              serviceId: original.service_id,
              staffId,
              startsAt,
              now,
              client,
            });

      if (!resolved) throw new SlotUnavailable();
      attempted = resolved;

      const endsAt = addMinutes(startsAt, service.duration_minutes);
      const blocksUntil = addMinutes(endsAt, service.turnaround_minutes);

      // (2) The new row inherits the customer AND the original manage token, so
      //     the link already in the customer's inbox still resolves.
      const inserted = await client.query(
        `insert into appointments (
            business_id, service_id, staff_id, resource_id, customer_id,
            starts_at, ends_at, blocks_until,
            status, source, manage_token, price_cents_at_booking, notes,
            rescheduled_from
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$10,$11,$12,$13)
           returning *`,
        [
          original.business_id,
          original.service_id,
          resolved.staffId,
          resolved.resourceId,
          original.customer_id, // §6: preserve customer_id
          startsAt.toISOString(),
          endsAt.toISOString(),
          blocksUntil.toISOString(),
          original.source,
          original.manage_token,
          // §7.1: the price stays the price it was booked at, even if the
          // service has since been repriced.
          original.price_cents_at_booking,
          original.notes,
          original.id,
        ],
      );
      const row = inserted.rows[0] as unknown as Appointment;

      await client.query(
        `insert into appointment_events (appointment_id, event, actor, detail)
              values ($1, 'rescheduled', $2, $3)`,
        [
          appointmentId,
          actor,
          JSON.stringify({ to_appointment_id: row.id, from: original.starts_at, to: startsAt.toISOString() }),
        ],
      );
      await client.query(
        `insert into appointment_events (appointment_id, event, actor, detail)
              values ($1, 'created', $2, $3)`,
        [row.id, actor, JSON.stringify({ rescheduled_from: original.id })],
      );

      return row;
    });

    return { ok: true, appointment: result, previousId: original.id };
  } catch (error) {
    if (isExclusionViolation(error) || error instanceof SlotUnavailable) {
      const tried = attempted as Slot | null;
      return {
        ok: false,
        error: 'slot_taken',
        slots: await freshSlotsFor(original.business_id, original.service_id, startsAt, staffId, now),
        // §7.1: "If the constraint rejects her edit, show her what it clashes
        // with." The original row is excluded — it was only cancelled inside
        // the transaction that just rolled back, so it is live again.
        clashesWith: await findClashes({
          businessId: original.business_id,
          staffId: tried?.staffId ?? staffId ?? original.staff_id,
          resourceId: tried?.resourceId ?? null,
          startsAt,
          blocksUntil: addMinutes(startsAt, occupancyMinutes),
          excludeAppointmentId: original.id,
        }),
        message: 'That time is no longer free. Here are the times still open.',
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Erasure — spec §9.4
// ---------------------------------------------------------------------------

/**
 * Marks an anonymised `customers` row.
 *
 * It goes in `phone` because that column is `not null` and carries
 * `unique (business_id, phone)`, so the placeholder has to be both present and
 * unique — the customer id supplies the uniqueness. A real number is E.164 and
 * always starts `+`, so a leading letter cannot collide with one.
 *
 * Consequence worth knowing: the same person booking again later comes back
 * through the `(business_id, phone)` upsert as a NEW customer row, with no link
 * to the erased one. That is the point.
 */
export const ERASED_PHONE_PREFIX = 'erased:';
export const ERASED_NAME = 'Deleted customer';

export function isErased(customer: { phone: string }): boolean {
  return customer.phone.startsWith(ERASED_PHONE_PREFIX);
}

export type ForgetResult =
  | { ok: true; cancelled: AppointmentDetail[]; alreadyErased: boolean }
  | { ok: false; error: 'not_found'; message: string };

/**
 * "Delete my details" — spec §9.4.
 *
 * ANONYMISE, NEVER DELETE. `appointments.customer_id` is `not null` and the
 * foreign keys are NO ACTION on purpose (§14), so a real DELETE either fails
 * loudly or, if the constraint were softened, tears a hole in the diary. The
 * studio's record of work done is not the customer's to erase; her name on it
 * is. So the row survives and is emptied of the person.
 *
 * Three things happen together, and all three are required:
 *
 *  1. Future bookings are cancelled. Erasing the phone number makes an upcoming
 *     appointment un-keepable — nobody could be told if the therapist were off
 *     sick — so leaving it on the diary would strand both sides. The owner is
 *     emailed about each one by the caller, after this commits.
 *  2. The identifying columns are overwritten, including free-text notes on
 *     both the customer and her appointments. Notes are where personal detail
 *     accumulates, and a deletion that leaves "phone her sister on 082…"
 *     behind has not deleted anything.
 *  3. Every manage token of hers is rotated, which kills the links already
 *     sitting in her inbox. Without this the record stays reachable by anyone
 *     holding an old link, and "erased" would not be true.
 *  4. Any chat transcript that produced a booking of hers is DELETED outright,
 *     not anonymised. The reasoning in (1) does not apply to it: the studio has
 *     no record-of-work interest in a conversation, and a transcript is exactly
 *     the free text point (2) is about — it is where someone types "I'm the one
 *     with the sensitive skin, my sister booked last week". Anonymising it
 *     would leave every one of those words behind attached to nobody, which is
 *     not erasure. Conversations that never booked have no customer to link to
 *     and are unreachable here; they age out on their own within 30 days.
 *
 * Idempotent: running it twice is harmless and reports `alreadyErased`.
 */
export async function forgetCustomer(options: {
  customerId: string;
  actor?: 'customer' | 'admin';
  now?: Date;
}): Promise<ForgetResult> {
  const { customerId, actor = 'customer', now = new Date() } = options;

  const customer = await queryOne<Customer>('select * from customers where id = $1', [customerId]);
  if (!customer) {
    return { ok: false, error: 'not_found', message: 'Those details could not be found.' };
  }
  if (isErased(customer)) {
    return { ok: true, cancelled: [], alreadyErased: true };
  }

  // Captured BEFORE the wipe: the owner's cancellation notice needs to say who
  // and what, and a moment later that is gone. Sent by the caller after commit.
  const upcoming = await query<AppointmentDetail>(
    `${DETAIL_SELECT}
      where a.customer_id = $1
        and a.status in ('pending','confirmed')
        and a.starts_at >= $2
      order by a.starts_at`,
    [customerId, now.toISOString()],
  );

  await withTransaction(async (client) => {
    // Serialise against in-flight bookings for this business, so a booking that
    // is mid-flight cannot attach a fresh appointment to a row we are about to
    // empty and leave the owner an uncontactable customer.
    await lockBusinessForWrite(client, customer.business_id);

    for (const appointment of upcoming) {
      await client.query(
        `update appointments
            set status = 'cancelled', cancelled_at = now()
          where id = $1
            and status in ('pending','confirmed')`,
        [appointment.id],
      );
      await client.query(
        `insert into appointment_events (appointment_id, event, actor, detail)
              values ($1, 'cancelled', $2, $3)`,
        [appointment.id, actor, JSON.stringify({ reason: 'customer_erased' })],
      );
      // Same reasoning as an ordinary cancellation (vouchers spec §3): an
      // appointment paid down with a voucher still owes the money back when
      // erasure cancels it out from under the voucher, not just when the
      // customer or the owner cancels it directly.
      await refundVoucherRedemptionsForAppointment(client, appointment.id, actor);
    }

    // Vouchers spec §7: her purchaser/recipient details are personal
    // information too, and are a place it lives that HANDOFF §11's erasure
    // path did not know about until now. Match on the details captured
    // BEFORE the wipe below — the same reason `upcoming` was read before the
    // transaction started. Ledger and balance are untouched; only who the
    // voucher names is cleared, exactly as the customer row itself is
    // emptied rather than deleted.
    await eraseVoucherPersonalData(client, {
      businessId: customer.business_id,
      phone: customer.phone,
      email: customer.email,
    });

    // Rotate every manage token, past and future, so old links stop resolving.
    // Generated per row in application code because manage_token is unique.
    const tokened = await client.query('select id from appointments where customer_id = $1', [
      customerId,
    ]);
    for (const row of tokened.rows) {
      await client.query('update appointments set manage_token = $2, notes = null where id = $1', [
        row.id,
        generateManageToken(),
      ]);
    }

    await client.query(
      `update customers
          set name  = $2,
              phone = $3,
              email = null,
              notes = null
        where id = $1`,
      [customerId, ERASED_NAME, `${ERASED_PHONE_PREFIX}${customerId}`],
    );

    // Chat transcripts of hers, gone. In the SAME transaction as the wipe, so
    // there is no window in which the customers row is empty and the
    // conversation that names her is still readable in Admin.
    await client.query('delete from ai_conversations where customer_id = $1', [customerId]);

    // Audit that it happened, against every appointment it touched. The event
    // records the act, deliberately not the person — a log of who asked to be
    // forgotten, keyed to their name, would defeat the request.
    for (const row of tokened.rows) {
      await client.query(
        `insert into appointment_events (appointment_id, event, actor, detail)
              values ($1, 'customer_erased', $2, $3)`,
        [row.id, actor, JSON.stringify({ cancelled_upcoming: upcoming.length })],
      );
    }
  });

  return { ok: true, cancelled: upcoming, alreadyErased: false };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export interface AppointmentDetail extends Appointment {
  service_name: string;
  service_duration_minutes: number;
  staff_name: string;
  resource_name: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  business_timezone: string;
  business_name: string;
  business_phone: string;
  business_whatsapp: string | null;
  min_notice_minutes: number;
}

const DETAIL_SELECT = `
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

export async function getAppointmentByToken(token: string): Promise<AppointmentDetail | null> {
  return queryOne<AppointmentDetail>(`${DETAIL_SELECT} where a.manage_token = $1`, [token]);
}

export async function getAppointmentById(id: string): Promise<AppointmentDetail | null> {
  return queryOne<AppointmentDetail>(`${DETAIL_SELECT} where a.id = $1`, [id]);
}

/** The Today screen (§7 screen 1) and the week calendar both read through this. */
export async function getAppointmentsBetween(
  businessId: string,
  from: Date,
  to: Date,
): Promise<AppointmentDetail[]> {
  return query<AppointmentDetail>(
    `${DETAIL_SELECT}
      where a.business_id = $1
        and a.starts_at >= $2
        and a.starts_at <  $3
      order by a.starts_at, st.name`,
    [businessId, from.toISOString(), to.toISOString()],
  );
}

/** One-tap completed / no_show from the Today screen (§7). */
export async function markAppointmentStatus(options: {
  appointmentId: string;
  status: 'completed' | 'no_show';
  actor?: 'admin' | 'system';
}): Promise<Appointment | null> {
  const { appointmentId, status, actor = 'admin' } = options;
  return withTransaction(async (client) => {
    const rows = await client.query(
      `update appointments set status = $2 where id = $1 returning *`,
      [appointmentId, status],
    );
    if (rows.rows.length === 0) return null;
    await client.query(
      `insert into appointment_events (appointment_id, event, actor) values ($1, $2, $3)`,
      [appointmentId, status, actor],
    );
    return rows.rows[0] as unknown as Appointment;
  });
}

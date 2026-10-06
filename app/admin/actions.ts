'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/supabase/session';
import {
  cancelBooking,
  createBooking,
  markAppointmentStatus,
  rescheduleBooking,
  type ClashSummary,
} from '@/lib/booking';
import {
  addAvailabilityBlock,
  createStaff,
  deactivateResource,
  deactivateService,
  deactivateStaff,
  renameResource,
  renameService,
  renameStaff,
  setWorkingHours,
  updateService,
  type HoursWindow,
} from '@/lib/config-guards';
import { query, queryOne } from '@/lib/db';
import { getBusiness } from '@/lib/availability';
import { zonedToUtc } from '@/lib/time';
import { formatZar } from '@/lib/money';
import { sendVoucherIssued } from '@/lib/email';
import {
  adjustVoucher,
  getVoucherByCode,
  getVoucherDetail,
  issueVoucher,
  markVoucherEmailed,
  redeemVoucher,
  voidVoucher,
} from '@/lib/vouchers';
import type { AppointmentDetail } from '@/lib/booking';

/**
 * Admin mutations. Every one of these starts with requireOwner().
 *
 * Reads in the admin go through the owner's Supabase session so RLS scopes
 * them (§7). Writes go through the transactional path in lib/booking.ts, which
 * bypasses RLS by design — so each action re-checks that the row it is about
 * to touch belongs to the owner's business. That check is the one place
 * application code is load-bearing for tenancy, and it is why it is here at
 * the top of every action rather than left to the caller.
 */

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string; conflicts?: AppointmentDetail[]; clashesWith?: ClashSummary[] };

/**
 * Turn a wall-clock date + time typed by the owner into a real instant, using
 * the business timezone rather than whatever zone her device happens to be in.
 */
async function toBusinessInstant(businessId: string, date: string, time: string): Promise<Date> {
  const business = await getBusiness(businessId);
  if (!business) throw new Error('Unknown business.');
  return zonedToUtc(date, time, business.timezone);
}

/** Throws unless the appointment belongs to the signed-in owner's business. */
async function assertOwnAppointment(appointmentId: string, businessId: string): Promise<void> {
  const row = await queryOne<{ business_id: string }>(
    'select business_id from appointments where id = $1',
    [appointmentId],
  );
  if (!row || row.business_id !== businessId) {
    throw new Error('That booking does not belong to this business.');
  }
}

function refreshAdmin() {
  revalidatePath('/admin');
  revalidatePath('/admin/week');
  revalidatePath('/admin/blocks');
  revalidatePath('/admin/settings');
  revalidatePath('/admin/vouchers');
}

// ---------------------------------------------------------------- Today screen

/** One-tap completed / no_show from the Today screen (§7). */
export async function markStatusAction(
  appointmentId: string,
  status: 'completed' | 'no_show',
): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  await assertOwnAppointment(appointmentId, businessId);

  await markAppointmentStatus({ appointmentId, status });
  refreshAdmin();
  return { ok: true, message: status === 'completed' ? 'Marked as done.' : 'Marked as a no-show.' };
}

export async function cancelAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  await assertOwnAppointment(appointmentId, businessId);

  const result = await cancelBooking({ appointmentId, actor: 'admin' });
  refreshAdmin();
  return result.ok ? { ok: true, message: 'Booking cancelled.' } : { ok: false, message: result.message };
}

// ------------------------------------------------------------------- walk-ins

/**
 * §7 screen 3. Without this the calendar diverges from reality within a week.
 * source = 'walkin' skips working hours and minimum notice (the customer is
 * standing at the counter) but NOT the double-booking checks.
 */
export async function createWalkInAction(input: {
  serviceId: string;
  staffId: string;
  /** Wall-clock date and time as typed in the studio, e.g. '2026-08-19' + '14:30'. */
  date: string;
  time: string;
  name: string;
  phone: string;
  notes?: string;
}): Promise<ActionResult & { appointmentId?: string; priceCents?: number }> {
  const { businessId } = await requireOwner();

  // §12: the server computes all times. The form sends the wall clock the
  // owner typed; converting it here means a laptop left on the wrong timezone
  // cannot quietly book someone two hours out.
  const startsAt = await toBusinessInstant(businessId, input.date, input.time);

  const result = await createBooking({
    businessId,
    serviceId: input.serviceId,
    staffId: input.staffId,
    startsAt,
    name: input.name,
    phone: input.phone,
    notes: input.notes ?? null,
    source: 'walkin',
  });

  refreshAdmin();
  if (result.ok) {
    return {
      ok: true,
      message: `Booked ${input.name} in.`,
      // A voucher is at least as likely at the counter as online (vouchers
      // spec §4) — the form uses this to offer redemption straight away.
      appointmentId: result.appointment.id,
      priceCents: result.appointment.price_cents_at_booking,
    };
  }
  return {
    ok: false,
    message: result.message,
    clashesWith: result.error === 'slot_taken' ? result.clashesWith : undefined,
  };
}

/**
 * Owner-side move. §7.1: "The owner is not exempt from double-booking checks —
 * she is the most likely person to cause one." If the constraint rejects it,
 * hand back what it clashes with so the UI can name it.
 */
export async function moveAppointmentAction(input: {
  appointmentId: string;
  date: string;
  time: string;
  staffId?: string | null;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  await assertOwnAppointment(input.appointmentId, businessId);

  const result = await rescheduleBooking({
    appointmentId: input.appointmentId,
    startsAt: await toBusinessInstant(businessId, input.date, input.time),
    staffId: input.staffId ?? null,
    actor: 'admin',
  });

  refreshAdmin();
  if (result.ok) return { ok: true, message: 'Booking moved.' };
  return {
    ok: false,
    message: result.message,
    clashesWith: result.error === 'slot_taken' ? result.clashesWith : undefined,
  };
}

// --------------------------------------------------------------------- blocks

export async function createBlockAction(input: {
  staffId?: string | null;
  resourceId?: string | null;
  /** Wall-clock in the studio's timezone; converted server-side (§12). */
  date: string;
  startTime: string;
  endTime: string;
  reason?: string;
  confirm?: boolean;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();

  const result = await addAvailabilityBlock({
    staffId: input.staffId ?? null,
    resourceId: input.resourceId ?? null,
    startsAt: await toBusinessInstant(businessId, input.date, input.startTime),
    endsAt: await toBusinessInstant(businessId, input.date, input.endTime),
    reason: input.reason ?? null,
    confirm: input.confirm ?? false,
  });

  refreshAdmin();
  if (result.ok) {
    return {
      ok: true,
      message:
        result.warnings.length > 0
          ? `Time blocked. ${result.warnings.length} existing booking${result.warnings.length === 1 ? '' : 's'} left in place.`
          : 'Time blocked.',
    };
  }
  return { ok: false, message: result.message, conflicts: result.conflicts };
}

export async function deleteBlockAction(blockId: string): Promise<ActionResult> {
  const { businessId } = await requireOwner();

  // Scope the delete to this business through the block's staff or resource.
  const deleted = await query<{ id: string }>(
    `delete from availability_blocks b
      using (select 1) as _
      where b.id = $1
        and (exists (select 1 from staff s where s.id = b.staff_id and s.business_id = $2)
             or exists (select 1 from resources r where r.id = b.resource_id and r.business_id = $2))
      returning b.id`,
    [blockId, businessId],
  );

  refreshAdmin();
  return deleted.length > 0
    ? { ok: true, message: 'Block removed.' }
    : { ok: false, message: 'That block could not be found.' };
}

// --------------------------------------------------------------- config (§7.1)

export async function updateServiceAction(
  serviceId: string,
  patch: {
    name?: string;
    description?: string | null;
    duration_minutes?: number;
    turnaround_minutes?: number;
    price_cents?: number;
  },
): Promise<ActionResult> {
  const { businessId } = await requireOwner();

  const service = await queryOne<{ business_id: string }>(
    'select business_id from services where id = $1',
    [serviceId],
  );
  if (!service || service.business_id !== businessId) {
    return { ok: false, message: 'That treatment does not belong to this business.' };
  }

  // §7.1: duration, price and turnaround changes save silently. Existing
  // bookings keep their stored times and price_cents_at_booking.
  //
  // The name goes through the guard rather than the raw patch so it gets the
  // same trimming and blank-rejection as every other rename.
  const { name, ...rest } = patch;
  await updateService(serviceId, rest);

  if (name !== undefined) {
    const renamed = await renameService({ businessId, serviceId, name });
    if (!renamed.ok) {
      refreshAdmin();
      return { ok: false, message: renamed.message };
    }
  }

  refreshAdmin();
  return { ok: true, message: 'Saved. Bookings already on the diary are unchanged.' };
}

export async function deactivateServiceAction(serviceId: string): Promise<ActionResult> {
  await requireOwner();
  const result = await deactivateService(serviceId);
  refreshAdmin();

  if (!result.ok) return { ok: false, message: result.message };
  const count = result.warnings.length;
  return {
    ok: true,
    message:
      count > 0
        ? `Hidden from the booking page. ${count} upcoming booking${count === 1 ? '' : 's'} use this. They will go ahead.`
        : 'Hidden from the booking page.',
  };
}

/** §7.1: blocked, not warned. Orphaned bookings are the dangerous case. */
export async function deactivateStaffAction(staffId: string): Promise<ActionResult> {
  await requireOwner();
  const result = await deactivateStaff(staffId);
  refreshAdmin();
  return result.ok
    ? { ok: true, message: 'Therapist made inactive.' }
    : { ok: false, message: result.message, conflicts: result.conflicts };
}

/**
 * Rename a therapist. Delegates to the guard because renaming a placeholder row
 * also has to move it out of the demo id namespace — see renameStaff().
 */
export async function renameStaffAction(staffId: string, name: string): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const result = await renameStaff({ businessId, staffId, name });
  refreshAdmin();
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
}

export async function renameResourceAction(resourceId: string, name: string): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const result = await renameResource({ businessId, resourceId, name });
  refreshAdmin();
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
}

/** §2's launch gate: the owner has to be able to enter her real therapists. */
export async function createStaffAction(name: string): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const result = await createStaff({ businessId, name });
  refreshAdmin();
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
}

export async function deactivateResourceAction(resourceId: string): Promise<ActionResult> {
  await requireOwner();
  const result = await deactivateResource(resourceId);
  refreshAdmin();
  return result.ok
    ? { ok: true, message: 'Taken out of service.' }
    : { ok: false, message: result.message, conflicts: result.conflicts };
}

export async function reactivateAction(
  table: 'services' | 'staff' | 'resources',
  id: string,
): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  // Table name is from a closed union, never from the request body.
  await query(`update ${table} set active = true where id = $1 and business_id = $2`, [id, businessId]);
  refreshAdmin();
  return { ok: true, message: 'Back in service.' };
}

export async function setWorkingHoursAction(input: {
  staffId: string;
  dayOfWeek: number;
  windows: HoursWindow[];
  confirm?: boolean;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();

  const result = await setWorkingHours({
    businessId,
    staffId: input.staffId,
    dayOfWeek: input.dayOfWeek,
    windows: input.windows,
    confirm: input.confirm ?? false,
  });

  refreshAdmin();
  if (result.ok) {
    return {
      ok: true,
      message:
        result.warnings.length > 0
          ? `Hours saved. ${result.warnings.length} booking${result.warnings.length === 1 ? '' : 's'} outside the new hours left in place.`
          : 'Hours saved.',
    };
  }
  return { ok: false, message: result.message, conflicts: result.conflicts };
}

// -------------------------------------------------------------------- vouchers
//
// spa-voucher-build-spec.md Phase A. Writes go through lib/vouchers.ts, which
// takes the same business advisory lock lib/booking.ts does — see the note in
// lib/db.ts. Reads that need the full ledger go through lib/vouchers.ts too;
// `app/admin/vouchers/page.tsx` calls listVouchers/outstandingLiability
// directly, the same shape as every other admin read in this file.

export type IssueVoucherActionResult =
  | { ok: true; message: string; voucher: { id: string; code: string; lookupToken: string } }
  | { ok: false; message: string };

/**
 * §4 "Issue" — amount in whole rand (vouchers are sold in round amounts;
 * there is no cents field in the form). Email is dispatched through after(),
 * never awaited here: §6.1, "sending must never fail the issue."
 */
export async function issueVoucherAction(input: {
  amountRand: number;
  purchaserName?: string;
  purchaserPhone?: string;
  recipientEmail?: string;
  /** 'YYYY-MM-DD'. Omitted (and neverExpires false) = the §5 default. */
  expiresAt?: string;
  neverExpires?: boolean;
  note?: string;
}): Promise<IssueVoucherActionResult> {
  const { businessId } = await requireOwner();

  if (!Number.isFinite(input.amountRand) || input.amountRand <= 0) {
    return { ok: false, message: 'Enter a voucher value greater than zero.' };
  }

  const business = await getBusiness(businessId);
  if (!business) return { ok: false, message: 'This business could not be found.' };

  const expiresAt = input.neverExpires
    ? null
    : input.expiresAt
      ? zonedToUtc(input.expiresAt, '23:59', business.timezone)
      : undefined;

  const result = await issueVoucher({
    businessId,
    initialCents: Math.round(input.amountRand) * 100,
    purchaserName: input.purchaserName,
    purchaserPhone: input.purchaserPhone,
    recipientEmail: input.recipientEmail,
    expiresAt,
    note: input.note,
    actor: 'admin',
  });

  if (!result.ok) return { ok: false, message: result.message };
  const voucher = result.voucher;

  const recipient = input.recipientEmail?.trim();
  if (recipient) {
    after(async () => {
      const sent = await sendVoucherIssued({
        voucherId: voucher.id,
        code: voucher.code,
        initialCents: voucher.initial_cents,
        expiresAt: voucher.expires_at ? new Date(voucher.expires_at) : null,
        lookupToken: voucher.lookup_token,
        recipientEmail: recipient,
        businessName: business.name,
        businessPhone: business.phone,
        businessAddress: business.address,
      });
      if (sent) await markVoucherEmailed(voucher.id);
    });
  }

  revalidatePath('/admin/vouchers');
  return {
    ok: true,
    message: recipient
      ? `Voucher ${voucher.code} issued. Emailing to ${recipient}…`
      : `Voucher ${voucher.code} issued.`,
    voucher: { id: voucher.id, code: voucher.code, lookupToken: voucher.lookup_token },
  };
}

export type CheckVoucherActionResult =
  | {
      ok: true;
      voucher: {
        code: string;
        purchaserName: string | null;
        balanceCents: number;
        expiresAt: string | null;
        status: string;
        expired: boolean;
      };
    }
  | { ok: false; message: string };

/** The "check" half of §4's Today-screen flow: code in, balance shown. */
export async function checkVoucherAction(code: string): Promise<CheckVoucherActionResult> {
  const { businessId } = await requireOwner();
  const voucher = await getVoucherByCode(businessId, code);
  if (!voucher) return { ok: false, message: 'No voucher with that code.' };
  return {
    ok: true,
    voucher: {
      code: voucher.code,
      purchaserName: voucher.purchaser_name,
      balanceCents: voucher.balance_cents,
      expiresAt: voucher.expires_at ? new Date(voucher.expires_at).toISOString() : null,
      status: voucher.status,
      expired: voucher.expired,
    },
  };
}

/**
 * The "confirm" half — §4: "one screen and two taps." Ties the redemption to
 * the appointment so a cancellation later refunds it automatically
 * (lib/booking.ts's cancelBooking).
 */
export async function redeemVoucherForAppointmentAction(input: {
  appointmentId: string;
  code: string;
  amountCents: number;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  await assertOwnAppointment(input.appointmentId, businessId);

  const result = await redeemVoucher({
    businessId,
    code: input.code,
    amountCents: input.amountCents,
    appointmentId: input.appointmentId,
    actor: 'admin',
  });

  refreshAdmin();
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    message: `Redeemed ${formatZar(input.amountCents)}. ${formatZar(result.voucher.balance_cents)} left on the voucher.`,
  };
}

export async function adjustVoucherAction(input: {
  voucherId: string;
  amountCents: number;
  reason: string;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const result = await adjustVoucher({
    businessId,
    voucherId: input.voucherId,
    amountCents: input.amountCents,
    reason: input.reason,
    actor: 'admin',
  });
  revalidatePath('/admin/vouchers');
  return result.ok
    ? { ok: true, message: `Balance adjusted. New balance ${formatZar(result.voucher.balance_cents)}.` }
    : { ok: false, message: result.message };
}

export async function voidVoucherAction(input: { voucherId: string; reason: string }): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const result = await voidVoucher({ businessId, voucherId: input.voucherId, reason: input.reason, actor: 'admin' });
  revalidatePath('/admin/vouchers');
  return result.ok ? { ok: true, message: 'Voucher voided.' } : { ok: false, message: result.message };
}

/**
 * A direct retry, unlike the after()-dispatched send on issue: this is the
 * one place the owner explicitly asks for a send and is owed a real answer,
 * so it awaits and reports success or failure rather than firing and forgetting.
 */
export async function resendVoucherEmailAction(input: {
  voucherId: string;
  recipientEmail: string;
}): Promise<ActionResult> {
  const { businessId } = await requireOwner();
  const recipient = input.recipientEmail.trim();
  if (!recipient) return { ok: false, message: 'Enter an email address to send to.' };

  const voucher = await getVoucherDetail(businessId, input.voucherId);
  if (!voucher) return { ok: false, message: 'That voucher could not be found.' };
  const business = await getBusiness(businessId);
  if (!business) return { ok: false, message: 'This business could not be found.' };

  const sent = await sendVoucherIssued({
    voucherId: voucher.id,
    code: voucher.code,
    initialCents: voucher.initial_cents,
    expiresAt: voucher.expires_at ? new Date(voucher.expires_at) : null,
    lookupToken: voucher.lookup_token,
    recipientEmail: recipient,
    businessName: business.name,
    businessPhone: business.phone,
    businessAddress: business.address,
  });
  if (sent) await markVoucherEmailed(voucher.id);

  revalidatePath('/admin/vouchers');
  return sent
    ? { ok: true, message: `Emailed to ${recipient}.` }
    : { ok: false, message: 'Could not send the email. Check that mail is configured.' };
}

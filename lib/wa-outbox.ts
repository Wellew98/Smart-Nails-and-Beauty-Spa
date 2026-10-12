import 'server-only';
import { query } from '@/lib/db';
import type { AppointmentDetail } from '@/lib/booking';
import { formatZar } from '@/lib/money';
import { formatSlotLabel } from '@/lib/time';

/**
 * WhatsApp owner alerts, store-and-forward.
 *
 * The sender (wa-sender/, a small Baileys service on the salon PC) polls
 * GET /api/wa/outbox because the PC has no public URL for webhooks. This
 * helper only queues the alert row; sending happens over there. Best-effort
 * by design — email is the reliable channel, so a queue failure must never
 * fail or slow a booking.
 */

export function ownerAlertBody(appointment: AppointmentDetail): string {
  const day = new Intl.DateTimeFormat('en-ZA', {
    timeZone: appointment.business_timezone,
    weekday: 'short',
  }).format(new Date(appointment.starts_at));
  const slot = formatSlotLabel(new Date(appointment.starts_at), appointment.business_timezone);
  const party = appointment.party_size > 1 ? ` (party of ${appointment.party_size})` : '';
  return (
    `NEW ${day} ${slot}: ${appointment.service_name} — ${appointment.customer_name} ` +
    `${appointment.customer_phone}, ${formatZar(appointment.price_cents_at_booking)} ` +
    `with ${appointment.staff_name}${party}`
  );
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

function daySlot(appointment: AppointmentDetail, startsAt: Date = new Date(appointment.starts_at)): string {
  const day = new Intl.DateTimeFormat('en-ZA', {
    timeZone: appointment.business_timezone,
    weekday: 'short',
  }).format(startsAt);
  return `${day} ${formatSlotLabel(startsAt, appointment.business_timezone)}`;
}

async function enqueue(to: string, appointment: AppointmentDetail, body: string): Promise<void> {
  if (!to) return;
  try {
    await query(
      `insert into wa_outbox (business_id, to_phone, body, status)
       values ($1, $2, $3, 'pending')`,
      [appointment.business_id, to, body],
    );
  } catch (error) {
    console.error('[wa-outbox] queue failed', {
      appointmentId: appointment.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Confirmation to the customer herself, on the number she booked with.
 * Short on purpose: the email carries the full detail. The manage link
 * matters most here, so a change never needs a phone call.
 */
export function customerAlertBody(appointment: AppointmentDetail): string {
  const day = new Intl.DateTimeFormat('en-ZA', {
    timeZone: appointment.business_timezone,
    weekday: 'short',
  }).format(new Date(appointment.starts_at));
  const slot = formatSlotLabel(new Date(appointment.starts_at), appointment.business_timezone);
  return (
    `Smart Nails: your ${appointment.service_name} on ${day} ${slot} ` +
    `with ${appointment.staff_name} is confirmed ` +
    `(${formatZar(appointment.price_cents_at_booking)}). ` +
    `Move or cancel: ${SITE_URL}/b/${appointment.manage_token}`
  );
}

/**
 * A move reads as a move on both phones: the new time first, the old one
 * for reference. A cancellation reads as final, with the book link so a
 * change of heart never needs a phone call.
 */
export function ownerMovedBody(appointment: AppointmentDetail, oldStartsAt: Date): string {
  const party = appointment.party_size > 1 ? ` (party of ${appointment.party_size})` : '';
  return (
    `MOVED to ${daySlot(appointment)} (was ${daySlot(appointment, oldStartsAt)}): ` +
    `${appointment.service_name} — ${appointment.customer_name} ` +
    `${appointment.customer_phone}, ${formatZar(appointment.price_cents_at_booking)} ` +
    `with ${appointment.staff_name}${party}`
  );
}

export function customerMovedBody(appointment: AppointmentDetail, oldStartsAt: Date): string {
  return (
    `Smart Nails: your ${appointment.service_name} moved to ${daySlot(appointment)} ` +
    `with ${appointment.staff_name} (was ${daySlot(appointment, oldStartsAt)}). ` +
    `Move or cancel: ${SITE_URL}/b/${appointment.manage_token}`
  );
}

export function ownerCancelledBody(appointment: AppointmentDetail): string {
  return (
    `CANCELLED ${daySlot(appointment)}: ${appointment.service_name} — ` +
    `${appointment.customer_name} ${appointment.customer_phone} ` +
    `with ${appointment.staff_name}`
  );
}

export function customerCancelledBody(appointment: AppointmentDetail): string {
  return (
    `Smart Nails: your ${appointment.service_name} on ${daySlot(appointment)} ` +
    `is cancelled. Book again any time: ${SITE_URL}/book`
  );
}

export async function queueOwnerAlert(appointment: AppointmentDetail): Promise<void> {
  await enqueue(process.env.WA_OWNER_NUMBER ?? '', appointment, ownerAlertBody(appointment));
}

/**
 * Queue the customer confirmation. Same table, same sender, same
 * best-effort contract — and the sender staggers deliveries so two
 * messages never leave back to back (automation-flag hygiene).
 */
export async function queueCustomerAlert(appointment: AppointmentDetail): Promise<void> {
  await enqueue(appointment.customer_phone, appointment, customerAlertBody(appointment));
}

export async function queueOwnerMoved(
  appointment: AppointmentDetail,
  oldStartsAt: Date,
): Promise<void> {
  await enqueue(process.env.WA_OWNER_NUMBER ?? '', appointment, ownerMovedBody(appointment, oldStartsAt));
}

export async function queueCustomerMoved(
  appointment: AppointmentDetail,
  oldStartsAt: Date,
): Promise<void> {
  await enqueue(appointment.customer_phone, appointment, customerMovedBody(appointment, oldStartsAt));
}

export async function queueOwnerCancelled(appointment: AppointmentDetail): Promise<void> {
  await enqueue(process.env.WA_OWNER_NUMBER ?? '', appointment, ownerCancelledBody(appointment));
}

export async function queueCustomerCancelled(appointment: AppointmentDetail): Promise<void> {
  await enqueue(appointment.customer_phone, appointment, customerCancelledBody(appointment));
}

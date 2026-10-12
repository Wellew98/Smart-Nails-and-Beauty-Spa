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

export async function queueOwnerAlert(appointment: AppointmentDetail): Promise<void> {
  const to = process.env.WA_OWNER_NUMBER;
  if (!to) return;
  try {
    await query(
      `insert into wa_outbox (business_id, to_phone, body, status)
       values ($1, $2, $3, 'pending')`,
      [appointment.business_id, to, ownerAlertBody(appointment)],
    );
  } catch (error) {
    console.error('[wa-outbox] queue failed', {
      appointmentId: appointment.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

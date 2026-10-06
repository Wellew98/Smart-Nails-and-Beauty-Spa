import 'server-only';
import { getTransport } from './mail';
import { formatZar } from './money';
import { formatPhoneForDisplay } from './phone';
import { formatDateTimeLabel } from './time';
import type { AppointmentDetail } from './booking';

/**
 * Transactional email — spec §7 step 12: confirmation to the customer and a
 * notification to the owner.
 *
 * WHAT GOES IN THE MESSAGE lives here. WHO PUTS IT ON THE WIRE lives in
 * `lib/mail.ts`, because the spa has no verified domain yet and the provider
 * therefore has to be swappable. Nothing in this file knows which one is in
 * use.
 *
 * Sending is best-effort and deliberately never throws into the write path. A
 * booking that is safely in the database must not be reported as a failure
 * because a mail provider had a bad minute; the customer would rebook and the
 * spa would have two appointments. Failures are logged for the owner to chase.
 *
 * Callers dispatch these through `next/server`'s `after()`, so a slow mailer
 * cannot delay the booking response — see `app/api/bookings/route.ts`.
 */

/**
 * What may be written to the log when a send fails — spec §9.5, "no personal
 * data in URLs or logs".
 *
 * A provider's error object is not ours and its shape is not guaranteed. It
 * can carry the request back with it, and the request contains a customer's
 * email address and name. Logging the whole thing puts personal data into
 * Vercel's log drain, where it lives on well past the booking and outside
 * anything the customer can ask us to erase. The message and status are what
 * anyone diagnosing this actually reads; the appointment id is the key for
 * joining back to the booking, which is in the database where it belongs.
 */
function safeError(error: unknown): { message: string; status?: number } {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; statusCode?: unknown; name?: unknown };
    const status = typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined;
    if (typeof candidate.message === 'string') return { message: candidate.message, status };
    if (typeof candidate.name === 'string') return { message: candidate.name, status };
  }
  return { message: 'unknown error' };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

function manageUrl(token: string): string {
  return `${SITE_URL}/b/${token}`;
}

function voucherUrl(token: string): string {
  return `${SITE_URL}/v/${token}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

function layout(heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fdf8f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2a1626">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${heading}</h1>
    ${body}
  </div></body></html>`;
}

function detailRows(appointment: AppointmentDetail): string {
  const when = formatDateTimeLabel(new Date(appointment.starts_at), appointment.business_timezone);
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#7a5a72">Treatment</td><td style="padding:6px 0;text-align:right">${escapeHtml(appointment.service_name)}</td></tr>
      <tr><td style="padding:6px 0;color:#7a5a72">When</td><td style="padding:6px 0;text-align:right">${escapeHtml(when)}</td></tr>
      <tr><td style="padding:6px 0;color:#7a5a72">With</td><td style="padding:6px 0;text-align:right">${escapeHtml(appointment.staff_name)}</td></tr>
      <tr><td style="padding:6px 0;color:#7a5a72">Price</td><td style="padding:6px 0;text-align:right">${formatZar(appointment.price_cents_at_booking)}</td></tr>
    </table>`;
}

/**
 * The single place a send is attempted. Swallows everything, by design — see
 * the note at the top of this file.
 */
async function deliver(
  what: string,
  appointment: AppointmentDetail,
  to: string | undefined | null,
  subject: string,
  html: string,
): Promise<void> {
  const transport = getTransport();
  // No mailer configured is a normal state before §1.2 is done, and no
  // recipient simply means this message has nobody to go to — the email field
  // on /book is optional. Neither is an error worth logging on every booking.
  if (!transport || !to) return;

  try {
    await transport.send({ to, subject, html, fromName: appointment.business_name });
  } catch (error) {
    console.error(`[email] ${what} failed`, {
      appointmentId: appointment.id,
      transport: transport.name,
      ...safeError(error),
    });
  }
}

export async function sendCustomerConfirmation(appointment: AppointmentDetail): Promise<void> {
  const url = manageUrl(appointment.manage_token);
  await deliver(
    'customer confirmation',
    appointment,
    appointment.customer_email,
    `Your booking at ${appointment.business_name}`,
    layout(
      `You're booked in, ${escapeHtml(appointment.customer_name.split(' ')[0])}`,
      `${detailRows(appointment)}
       <p style="margin:20px 0 0;font-size:14px;line-height:1.6">
         Need to move or cancel it?
         <a href="${url}" style="color:#c2185b">Manage your booking</a>.
       </p>
       <p style="margin:16px 0 0;font-size:12px;color:#9b7f94">
         ${escapeHtml(appointment.business_name)} · ${escapeHtml(formatPhoneForDisplay(appointment.business_phone))}
       </p>`,
    ),
  );
}

export async function sendOwnerNotification(appointment: AppointmentDetail): Promise<void> {
  await deliver(
    'owner notification',
    appointment,
    process.env.OWNER_NOTIFICATION_EMAIL,
    `New booking: ${appointment.service_name}, ${appointment.staff_name}`,
    layout(
      'New booking',
      `${detailRows(appointment)}
       <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
         <tr><td style="padding:6px 0;color:#7a5a72">Customer</td><td style="padding:6px 0;text-align:right">${escapeHtml(appointment.customer_name)}</td></tr>
         <tr><td style="padding:6px 0;color:#7a5a72">Phone</td><td style="padding:6px 0;text-align:right">${escapeHtml(formatPhoneForDisplay(appointment.customer_phone))}</td></tr>
       </table>`,
    ),
  );
}

export async function sendCancellationNotice(appointment: AppointmentDetail): Promise<void> {
  await deliver(
    'cancellation notice',
    appointment,
    process.env.OWNER_NOTIFICATION_EMAIL,
    `Cancelled: ${appointment.service_name}, ${appointment.staff_name}`,
    layout('Booking cancelled', detailRows(appointment)),
  );
}

// ---------------------------------------------------------------------------
// Vouchers — spa-voucher-build-spec.md §6.1.
// ---------------------------------------------------------------------------

export interface VoucherEmailInput {
  voucherId: string;
  code: string;
  initialCents: number;
  expiresAt: Date | null;
  lookupToken: string;
  recipientEmail: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string | null;
}

/**
 * Unlike the three functions above, the caller here needs to know whether
 * this actually went out: §6.1 says the issue screen "must show whether the
 * email actually went, based on `emailed_at` — not assume it did," so a
 * boolean return is what lets the caller decide whether to stamp it. Still
 * never throws — a failed send is a false return, not an exception, and it
 * can never fail the write path. The voucher is created and the money is
 * already taken (§6.1, §10).
 */
export async function sendVoucherIssued(input: VoucherEmailInput): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;

  const expiryLabel = input.expiresAt
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        input.expiresAt,
      )
    : null;

  const html = layout(
    'Your gift voucher',
    `<p style="margin:0 0 18px;font-size:32px;font-weight:700;letter-spacing:0.04em;text-align:center;color:#c2185b">${escapeHtml(input.code)}</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px">
       <tr><td style="padding:6px 0;color:#7a5a72">Value</td><td style="padding:6px 0;text-align:right">${formatZar(input.initialCents)}</td></tr>
       <tr><td style="padding:6px 0;color:#7a5a72">Expires</td><td style="padding:6px 0;text-align:right">${expiryLabel ? escapeHtml(expiryLabel) : 'Never'}</td></tr>
     </table>
     <p style="margin:20px 0 0;font-size:14px;line-height:1.6">
       <a href="${voucherUrl(input.lookupToken)}" style="color:#c2185b">Check the balance</a> any time — no account needed.
     </p>
     <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#7a5a72">
       This voucher can be given to someone else, and used across more than one visit.
     </p>
     <p style="margin:16px 0 0;font-size:12px;color:#9b7f94">
       ${escapeHtml(input.businessName)}${input.businessAddress ? ` · ${escapeHtml(input.businessAddress)}` : ''} · ${escapeHtml(formatPhoneForDisplay(input.businessPhone))}
     </p>`,
  );

  try {
    await transport.send({
      to: input.recipientEmail,
      subject: `Your ${formatZar(input.initialCents)} voucher for ${input.businessName}`,
      html,
      fromName: input.businessName,
    });
    return true;
  } catch (error) {
    console.error('[email] voucher issued failed', {
      voucherId: input.voucherId,
      transport: transport.name,
      ...safeError(error),
    });
    return false;
  }
}

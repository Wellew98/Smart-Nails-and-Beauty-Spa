'use client';

import Link from 'next/link';
import type { BookingAttachment } from '@/lib/ai/types';

/**
 * A booked appointment, and the link that manages it.
 *
 * ---------------------------------------------------------------------------
 * THE LINK IS THE ONLY CREDENTIAL, SO IT IS SHOWN AND NOT EXPLAINED AWAY.
 *
 * `manage_token` is 32 random bytes and it is the entire ownership proof for
 * this appointment (§6). There is no account, no password, and deliberately no
 * lookup by name or phone — guessing which booking belongs to whoever is
 * asking is how one customer gets handed another's.
 *
 * So the customer needs this link, and needs to keep it. It renders here, in
 * their own browser, from the client projection. It never went to the model.
 *
 * Cancel and move are presented as ordinary links into the existing management
 * page rather than as chat buttons. Destructive actions belong on a page that
 * shows the booking in full, and `/b/[token]` already does that, already
 * enforces the notice rule, and already works with the assistant switched off.
 * ---------------------------------------------------------------------------
 */
export function ManageLink({ attachment }: { attachment: BookingAttachment }) {
  const { booking, justBooked } = attachment;
  const cancelled = booking.status === 'cancelled';

  return (
    <div
      className={`rounded-xl border p-4 ${
        cancelled ? 'border-blush-200 bg-blush-100' : 'border-gilt-200 bg-white'
      }`}
    >
      <p className="text-[0.65rem] tracking-[0.22em] text-gilt-600 uppercase">
        {cancelled ? 'Cancelled' : justBooked ? 'Confirmed' : 'Your booking'}
      </p>

      <p className="font-display mt-2 text-lg leading-tight font-semibold text-aubergine-900">
        {booking.serviceName}
      </p>
      <p className="tabular mt-1 text-sm text-mauve-500">
        {booking.date} at <span className="font-mono">{booking.time}</span>
        {booking.staffName ? ` · ${booking.staffName}` : ''}
      </p>

      {!cancelled && (
        <>
          <Link
            href={booking.manageUrl}
            className="mt-3 inline-block rounded-full bg-aubergine-900 px-5 py-2.5 text-sm font-medium text-blush-50 hover:bg-aubergine-800"
          >
            {booking.canChange ? 'View, change or cancel' : 'View booking'}
          </Link>

          <p className="mt-2 text-[0.7rem] leading-snug text-mauve-400">
            {booking.canChange
              ? 'Keep this link. It is the only way back to this booking.'
              : 'It is too close to your appointment to change it online. Please phone or WhatsApp us.'}
          </p>
        </>
      )}
    </div>
  );
}

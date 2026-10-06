'use client';

import { useRef, useState } from 'react';
import { Swatch } from '@/components/swatch';

/**
 * The confirmation card. Nothing is booked until the button on it is pressed.
 *
 * ---------------------------------------------------------------------------
 * RENDERED CLIENT-SIDE FROM TWO SOURCES THAT NEVER MEET ON THE SERVER.
 *
 * The treatment, date, time and therapist come from tool output — resolved by
 * the availability engine, never invented. The name and phone come from local
 * state in this browser and have not been sent anywhere yet. They are posted
 * once, with the confirmation, straight to the booking write; they are never
 * put in a chat message, so they cannot reach the model even by accident.
 * ---------------------------------------------------------------------------
 */

export interface PendingBooking {
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  startsAt: string;
  staffId: string | null;
  staffName: string;
  price: string;
}

/** One confirmation gets one key, for as long as it is the same confirmation. */
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingSummary({
  pending,
  onConfirm,
  disabled,
}: {
  pending: PendingBooking;
  onConfirm: (details: {
    name: string;
    phone: string;
    email: string | null;
    idempotencyKey: string;
  }) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  /**
   * -------------------------------------------------------------------------
   * THE IDEMPOTENCY KEY IS A LIFECYCLE PROBLEM, NOT A RANDOMNESS ONE.
   *
   * Generate it during render and it changes on every re-render — every
   * keystroke in the name field — so a double tap sends two different keys and
   * books two appointments. That is the bug the key exists to prevent, and it
   * would only show up on a slow connection, which is exactly when people tap
   * twice.
   *
   * Hold it too stably and the opposite happens: the customer changes their
   * mind, picks a different time, confirms again, and `createBooking`'s replay
   * path hands back the ORIGINAL appointment. They believe they have moved and
   * they have not. `tests/ai/booking-flow.test.ts` pins both directions.
   *
   * So: a ref, minted on the first confirmation of a given selection and
   * re-minted when the selection changes. The key itself is random — the
   * signature only decides WHEN to mint a new one, which is not the same as
   * deriving the key from the slot.
   * -------------------------------------------------------------------------
   */
  const minted = useRef<{ signature: string; key: string } | null>(null);
  const signature = `${pending.serviceId}|${pending.startsAt}|${pending.staffId ?? 'any'}`;

  const idempotencyKeyForThisConfirmation = (): string => {
    if (minted.current?.signature !== signature) {
      minted.current = { signature, key: newIdempotencyKey() };
    }
    return minted.current.key;
  };

  const ready = name.trim().length > 0 && phone.trim().length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || disabled) return;
        onConfirm({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          idempotencyKey: idempotencyKeyForThisConfirmation(),
        });
      }}
      className="rounded-xl border border-blush-200 bg-white p-4"
    >
      <p className="text-[0.65rem] tracking-[0.22em] text-gilt-600 uppercase">Check and confirm</p>

      <div className="mt-3 flex items-start gap-3">
        <Swatch serviceName={pending.serviceName} size="dot" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.98rem] leading-tight text-aubergine-900">{pending.serviceName}</p>
          <p className="tabular mt-1 text-sm text-mauve-500">
            {pending.date} at <span className="font-mono">{pending.time}</span>
          </p>
          {pending.staffName && (
            <p className="mt-0.5 text-xs text-mauve-400">with {pending.staffName}</p>
          )}
        </div>
        <span className="tabular text-sm font-medium text-aubergine-900">{pending.price}</span>
      </div>

      <div className="mt-4 space-y-2">
        <label className="block">
          <span className="sr-only">Your name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            maxLength={120}
            className="min-h-11 w-full rounded-xl border border-blush-300 px-3 py-2 text-[0.95rem] text-aubergine-900 placeholder:text-mauve-400 focus:border-lacquer-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">Mobile number</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Mobile number"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            className="min-h-11 w-full rounded-xl border border-blush-300 px-3 py-2 text-[0.95rem] text-aubergine-900 placeholder:text-mauve-400 focus:border-lacquer-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="sr-only">Email (optional)</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email (optional)"
            inputMode="email"
            autoComplete="email"
            className="min-h-11 w-full rounded-xl border border-blush-300 px-3 py-2 text-[0.95rem] text-aubergine-900 placeholder:text-mauve-400 focus:border-lacquer-400 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={!ready || disabled}
        className="mt-3 min-h-12 w-full rounded-full bg-lacquer-500 px-5 py-3 text-sm font-medium text-blush-50 transition-colors hover:bg-lacquer-600 disabled:opacity-40"
      >
        Confirm booking
      </button>

      <p className="mt-2 text-[0.7rem] leading-snug text-mauve-400">
        We use your number to confirm and to contact you about this appointment. Nothing is booked
        until you press confirm.
      </p>
    </form>
  );
}

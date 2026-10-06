'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Swatch } from '@/components/swatch';
import { formatZar } from '@/lib/money';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';
import type { BookableDay } from './booking-flow';

interface Slot {
  startsAt: string;
  label: string;
  staffName: string;
}

interface ManagedAppointment {
  id: string;
  serviceId: string;
  serviceName: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  priceCents: number;
  customerName: string;
}

/**
 * Spec §6 — the customer's own page. No login: the token in the URL is the
 * credential.
 *
 * "Can I move my Thursday to Saturday?" is the highest-volume message a spa
 * receives. If it still lands in WhatsApp, the system has not reduced the
 * owner's work. So rescheduling is the primary action here, not a footnote
 * next to cancel.
 */
export function ManageBooking({
  token,
  appointment,
  staff,
  days,
  timezone,
  minNoticeMinutes,
  businessName,
  businessPhone,
  businessWhatsapp,
}: {
  token: string;
  appointment: ManagedAppointment;
  staff: { id: string; name: string }[];
  days: BookableDay[];
  timezone: string;
  minNoticeMinutes: number;
  businessName: string;
  businessPhone: string;
  businessWhatsapp: string | null;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<'view' | 'reschedule' | 'confirm-cancel' | 'confirm-forget'>(
    'view',
  );
  const [date, setDate] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string>('any');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'moved' | 'cancelled' | 'erased' | null>(null);

  const cancelled = appointment.status === 'cancelled';
  const past = new Date(appointment.startsAt).getTime() < Date.now();
  const lockedOut =
    new Date(appointment.startsAt).getTime() - minNoticeMinutes * 60_000 < Date.now();

  useEffect(() => {
    if (mode === 'reschedule' && !date) {
      setDate(days.find((day) => day.open)?.date ?? null);
    }
  }, [mode, date, days]);

  const loadSlots = useCallback(async () => {
    if (!date) return;
    setLoadingSlots(true);
    try {
      const response = await fetch(
        `/api/availability?service=${appointment.serviceId}&date=${date}&staff=${staffId}`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      setSlots(response.ok ? data.slots : []);
    } catch {
      setSlots([]);
      setError('We could not load times. Check your connection and try again.');
    } finally {
      setLoadingSlots(false);
    }
  }, [appointment.serviceId, date, staffId]);

  useEffect(() => {
    if (mode === 'reschedule') void loadSlots();
  }, [mode, loadSlots]);

  async function moveTo(slot: Slot) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/manage/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starts_at: slot.startsAt, staff_id: staffId }),
      });
      const data = await response.json();

      if (response.status === 409 && data.slots) {
        setSlots(data.slots);
        setError(data.message ?? 'That time has just gone. Please pick another.');
        return;
      }
      if (!response.ok) {
        setError(data.message ?? 'We could not move your booking. Please try again.');
        return;
      }

      setDone('moved');
      router.refresh();
    } catch {
      setError('We could not reach the booking system. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/manage/${token}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? 'We could not cancel your booking. Please phone us.');
        setMode('view');
        return;
      }
      setDone('cancelled');
      router.refresh();
    } catch {
      setError('We could not reach the booking system. Please phone us.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Spec §9.4 — "delete my details".
   *
   * Deliberately does NOT call router.refresh() on success: erasing rotates
   * every manage token, so this page's own URL is dead the instant it returns.
   * A refresh would replace the confirmation with a 404 and leave the customer
   * unsure whether anything happened.
   */
  const [erasedCancelCount, setErasedCancelCount] = useState(0);

  async function forget() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/manage/${token}/forget`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? 'We could not remove your details. Please phone us.');
        setMode('view');
        return;
      }
      setErasedCancelCount(data.cancelled ?? 0);
      setDone('erased');
    } catch {
      setError('We could not reach the booking system. Please phone us.');
    } finally {
      setBusy(false);
    }
  }

  const eraseControls = (
    <EraseDetails
      mode={mode}
      busy={busy}
      onAsk={() => setMode('confirm-forget')}
      onKeep={() => setMode('view')}
      onConfirm={forget}
    />
  );

  const when = new Intl.DateTimeFormat('en-ZA', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(appointment.startsAt));

  // ------------------------------------------------------------------- states
  if (done === 'erased') {
    return (
      <Shell title="Details deleted" serviceName={appointment.serviceName}>
        <p className="text-[0.95rem] leading-relaxed text-mauve-500">
          Your name, number and email address have been removed from {businessName}&rsquo;s
          records.
          {erasedCancelCount > 0 &&
            ` ${erasedCancelCount === 1 ? 'Your upcoming booking was' : `Your ${erasedCancelCount} upcoming bookings were`} cancelled, because we would have no way to contact you about ${erasedCancelCount === 1 ? 'it' : 'them'}.`}
        </p>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-mauve-500">
          This link has stopped working. You are very welcome to book again any time. It will
          start fresh.
        </p>
        <div className="mt-7">
          <Link
            href="/book"
            className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
          >
            Book a treatment
          </Link>
        </div>
      </Shell>
    );
  }

  if (done === 'cancelled' || (cancelled && !done)) {
    return (
      <Shell title="Booking cancelled" serviceName={appointment.serviceName}>
        <p className="text-[0.95rem] leading-relaxed text-mauve-500">
          {done === 'cancelled'
            ? 'That is cancelled and the time has been released. Nothing further to do.'
            : 'This booking was cancelled.'}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/book"
            className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
          >
            Book another time
          </Link>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
            {error}
          </p>
        )}

        {/* A cancelled booking is still a record with her name on it (§9.4). */}
        {eraseControls}
      </Shell>
    );
  }

  if (done === 'moved') {
    return (
      <Shell title="Booking moved" serviceName={appointment.serviceName}>
        <p className="text-[0.95rem] leading-relaxed text-mauve-500">
          Your new time is confirmed and the old one is free again. This same link will always show
          your latest booking.
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setMode('view');
            }}
            className="rounded-full border border-aubergine-900/25 px-6 py-3 text-sm hover:bg-blush-100"
          >
            See the booking
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={past ? 'Past booking' : 'Your booking'} serviceName={appointment.serviceName}>
      <dl className="divide-y divide-blush-200 border-y border-blush-200">
        <Row term="Treatment" detail={appointment.serviceName} />
        <Row term="When" detail={when} mono />
        <Row term="With" detail={appointment.staffName} />
        <Row term="Price" detail={formatZar(appointment.priceCents)} />
      </dl>

      {error && (
        <p role="alert" className="mt-5 rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
          {error}
        </p>
      )}

      {past ? (
        <p className="mt-6 text-sm text-mauve-500">
          This appointment has been and gone. We hope it was a good one.
        </p>
      ) : lockedOut ? (
        <div className="mt-6 rounded-xl bg-blush-100 px-5 py-5">
          <p className="text-sm leading-relaxed text-aubergine-900">
            It is now less than {minNoticeMinutes / 60} hours before your appointment, so changes
            cannot be made online.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <a href={`tel:${businessPhone}`} className="text-lacquer-500 underline underline-offset-4">
              Call {formatPhoneForDisplay(businessPhone)}
            </a>
            {businessWhatsapp && (
              <a
                href={whatsappLink(
                  businessWhatsapp,
                  `Hi, it's ${appointment.customerName}. I need to change my ${appointment.serviceName} booking.`,
                )}
                className="text-lacquer-500 underline underline-offset-4"
              >
                WhatsApp us
              </a>
            )}
          </div>
        </div>
      ) : mode === 'view' ? (
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode('reschedule')}
            className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
          >
            Move to another time
          </button>
          <button
            type="button"
            onClick={() => setMode('confirm-cancel')}
            className="rounded-full border border-aubergine-900/25 px-6 py-3 text-sm hover:bg-blush-100"
          >
            Cancel booking
          </button>
        </div>
      ) : mode === 'confirm-cancel' ? (
        <div className="mt-7 rounded-xl border border-blush-300 px-5 py-5">
          <p className="text-[0.95rem] text-aubergine-900">
            Cancel this booking? The time will go back on the diary for someone else.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
            >
              {busy ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="rounded-full border border-aubergine-900/25 px-6 py-3 text-sm hover:bg-blush-100"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : mode === 'reschedule' ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold text-aubergine-900">Pick a new time</h2>
            <button
              type="button"
              onClick={() => setMode('view')}
              className="text-sm text-mauve-500 underline underline-offset-4 hover:text-aubergine-900"
            >
              Never mind
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Chip label="Anyone" selected={staffId === 'any'} onClick={() => setStaffId('any')} />
            {staff.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={staffId === member.id}
                onClick={() => setStaffId(member.id)}
              />
            ))}
          </div>

          <div className="scrollbar-none -mx-5 mt-5 overflow-x-auto px-5">
            <div className="flex w-max gap-2">
              {days.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  disabled={!day.open}
                  onClick={() => setDate(day.date)}
                  aria-pressed={day.date === date}
                  className={`w-16 shrink-0 rounded-xl border px-2 py-3 text-center transition-colors ${
                    !day.open
                      ? 'cursor-not-allowed border-blush-100 text-mauve-400/50'
                      : day.date === date
                        ? 'border-aubergine-900 bg-aubergine-900 text-blush-50'
                        : 'border-blush-200 text-aubergine-900 hover:bg-blush-100'
                  }`}
                >
                  <span className="block text-[0.65rem] tracking-wider uppercase">
                    {day.isToday ? 'Today' : day.weekdayLabel}
                  </span>
                  <span className="tabular mt-1 block font-mono text-lg leading-none">
                    {day.dayLabel}
                  </span>
                  <span className="mt-1 block text-[0.6rem] uppercase opacity-70">
                    {day.monthLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            {loadingSlots ? (
              <p className="py-5 text-sm text-mauve-400">Checking what&rsquo;s free…</p>
            ) : slots.length === 0 ? (
              <p className="rounded-xl bg-blush-100 px-5 py-5 text-sm text-aubergine-900">
                Nothing left on this day. Try another.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <li key={slot.startsAt}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => moveTo(slot)}
                      className="w-full rounded-xl border border-blush-200 px-2 py-3 transition-colors hover:border-aubergine-900 hover:bg-blush-100 disabled:opacity-50"
                    >
                      <span className="tabular block font-mono text-[0.95rem] leading-none text-aubergine-900">
                        {slot.label}
                      </span>
                      {staffId === 'any' && slot.staffName && (
                        <span className="mt-1 block text-[0.65rem] text-mauve-400">
                          {slot.staffName}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {eraseControls}

      <p className="mt-10 text-xs text-mauve-400">
        {businessName} · {formatPhoneForDisplay(businessPhone)}
      </p>
    </Shell>
  );
}

/**
 * Spec §9.4 — the POPIA erasure control.
 *
 * Deliberately a plain text link rather than a button: it is a right, so it
 * must be present and findable on every state of this page, but it is not one
 * of the two things a customer came here to do. Putting it at button weight
 * next to "Move" and "Cancel" would make deleting your history look like a
 * normal step in managing a booking, and someone would take it by accident.
 *
 * The confirmation spells out all three consequences before the irreversible
 * tap, because every one of them surprises people: upcoming bookings go, the
 * link in their inbox dies, and nothing comes back.
 */
function EraseDetails({
  mode,
  busy,
  onAsk,
  onKeep,
  onConfirm,
}: {
  mode: string;
  busy: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  if (mode !== 'confirm-forget') {
    return (
      <div className="mt-10 border-t border-blush-200 pt-6">
        <button
          type="button"
          onClick={onAsk}
          className="text-sm text-mauve-400 underline underline-offset-4 hover:text-aubergine-900"
        >
          Delete my details
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-xl border border-blush-300 px-5 py-5">
      <h2 className="font-display text-lg font-semibold text-aubergine-900">
        Delete your details?
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-mauve-600">
        <li>
          Your name, number and email address are erased from the studio&rsquo;s records. The
          appointments stay on the diary, but without anything identifying you.
        </li>
        <li>Any booking you still have coming up is cancelled.</li>
        <li>This link stops working, and none of it can be undone.</li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
        >
          {busy ? 'Deleting…' : 'Yes, delete my details'}
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="rounded-full border border-aubergine-900/25 px-6 py-3 text-sm hover:bg-blush-100"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}

function Shell({
  title,
  serviceName,
  children,
}: {
  title: string;
  serviceName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl px-5 pt-14 pb-4 sm:pt-20">
      <div className="flex items-start gap-5">
        <Swatch serviceName={serviceName} size="chip" />
        <div>
          <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Manage</p>
          <h1 className="font-display mt-3 text-[2rem] leading-tight font-semibold text-aubergine-900">
            {title}
          </h1>
        </div>
      </div>
      <div className="mt-9">{children}</div>
    </div>
  );
}

function Row({ term, detail, mono = false }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-sm text-mauve-500">{term}</dt>
      <dd className={`text-right text-[0.95rem] text-aubergine-900 ${mono ? 'tabular font-mono' : ''}`}>
        {detail}
      </dd>
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
        selected
          ? 'border-aubergine-900 bg-aubergine-900 text-blush-50'
          : 'border-blush-200 text-aubergine-900 hover:bg-blush-100'
      }`}
    >
      {label}
    </button>
  );
}

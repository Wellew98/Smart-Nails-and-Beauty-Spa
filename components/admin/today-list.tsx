'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Swatch } from '@/components/swatch';
import { VoucherRedeem } from '@/components/admin/voucher-redeem';
import { cancelAppointmentAction, markStatusAction } from '@/app/admin/actions';
import { formatZar } from '@/lib/money';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';
import { addDays } from '@/lib/time';

interface Row {
  id: string;
  startsAt: string;
  endsAt: string;
  blocksUntil: string;
  status: string;
  source: string;
  serviceName: string;
  staffName: string;
  resourceName: string | null;
  customerName: string;
  customerPhone: string;
  priceCents: number;
  notes: string | null;
}

export function TodayList({
  date,
  today,
  timezone,
  businessName,
  appointments,
}: {
  date: string;
  today: string;
  timezone: string;
  businessName: string;
  appointments: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);
  const [voucherFor, setVoucherFor] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setFlash({ ok: result.ok, message: result.message ?? (result.ok ? 'Done.' : 'That did not work.') });
      router.refresh();
    });
  }

  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  const heading = new Intl.DateTimeFormat('en-ZA', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));

  const live = appointments.filter((a) => a.status === 'pending' || a.status === 'confirmed');
  const closed = appointments.filter((a) => a.status !== 'pending' && a.status !== 'confirmed');

  return (
    <div className="pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-aubergine-900">
            {date === today ? 'Today' : heading}
          </h1>
          {date === today && <p className="mt-0.5 text-sm text-mauve-500">{heading}</p>}
        </div>
        <p className="tabular text-sm text-mauve-500">
          {live.length} booking{live.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Day stepper — she flicks between yesterday and tomorrow constantly. */}
      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/admin?date=${addDays(date, -1)}`}
          className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
        >
          ←
        </Link>
        {date !== today && (
          <Link
            href="/admin"
            className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
          >
            Today
          </Link>
        )}
        <Link
          href={`/admin?date=${addDays(date, 1)}`}
          className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
        >
          →
        </Link>
        <Link
          href="/admin/walk-in"
          className="ml-auto rounded-full bg-lacquer-500 px-4 py-1.5 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
        >
          Add walk-in
        </Link>
      </div>

      {flash && (
        <p
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            flash.ok ? 'bg-sage-500/15 text-sage-600' : 'bg-lacquer-500/10 text-lacquer-600'
          }`}
        >
          {flash.message}
        </p>
      )}

      {live.length === 0 && closed.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-blush-200 bg-blush-100 px-6 py-10 text-center">
          <p className="text-aubergine-900">Nothing booked.</p>
          <p className="mt-1 text-sm text-mauve-500">
            A free day, or one to fill. Walk-ins go straight on the diary.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {live.map((appointment) => (
            <li
              key={appointment.id}
              className="rounded-2xl border border-blush-200 bg-white px-4 py-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="shrink-0 text-center">
                  <p className="tabular font-mono text-lg leading-none font-medium text-aubergine-900">
                    {time(appointment.startsAt)}
                  </p>
                  <p className="tabular mt-1 font-mono text-[0.7rem] text-mauve-400">
                    {time(appointment.endsAt)}
                  </p>
                </div>

                <Swatch serviceName={appointment.serviceName} size="dot" className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  <p className="leading-tight font-medium text-aubergine-900">
                    {appointment.customerName}
                  </p>
                  <p className="mt-0.5 text-sm text-mauve-600">{appointment.serviceName}</p>
                  <p className="mt-1 text-xs text-mauve-400">
                    {appointment.staffName}
                    {appointment.resourceName && ` · ${appointment.resourceName}`}
                    {appointment.source === 'walkin' && ' · walk-in'}
                    {' · '}
                    <span className="tabular">{formatZar(appointment.priceCents)}</span>
                  </p>
                  {appointment.notes && (
                    <p className="mt-2 rounded-lg bg-blush-100 px-3 py-2 text-xs text-mauve-600">
                      {appointment.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact first: this is what she reaches for most. */}
              <div className="mt-3.5 flex flex-wrap gap-2">
                <a
                  href={whatsappLink(
                    appointment.customerPhone,
                    `Hi ${appointment.customerName.split(' ')[0]}, it's ${businessName} about your ${appointment.serviceName} booking.`,
                  )}
                  className="rounded-full bg-sage-600 px-3.5 py-2 text-xs font-medium text-blush-50 hover:opacity-90"
                >
                  WhatsApp
                </a>
                <a
                  href={`tel:${appointment.customerPhone}`}
                  className="rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100"
                >
                  {formatPhoneForDisplay(appointment.customerPhone)}
                </a>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setVoucherFor(voucherFor === appointment.id ? null : appointment.id)}
                  className="ml-auto rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
                >
                  Voucher
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => markStatusAction(appointment.id, 'completed'))}
                  className="rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
                >
                  Done
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => markStatusAction(appointment.id, 'no_show'))}
                  className="rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
                >
                  No-show
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Cancel ${appointment.customerName}'s booking?`)) {
                      run(() => cancelAppointmentAction(appointment.id));
                    }
                  }}
                  className="rounded-full border border-blush-300 px-3.5 py-2 text-xs text-lacquer-600 hover:bg-lacquer-500/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>

              {voucherFor === appointment.id && (
                <VoucherRedeem
                  appointmentId={appointment.id}
                  priceCents={appointment.priceCents}
                  onRedeemed={() => {
                    setVoucherFor(null);
                    router.refresh();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mt-9 text-xs tracking-[0.18em] text-gilt-600 uppercase">Settled</h2>
          <ul className="mt-3 space-y-2">
            {closed.map((appointment) => (
              <li
                key={appointment.id}
                className="flex items-center gap-3 rounded-xl border border-blush-200 px-4 py-3 text-sm"
              >
                <span className="tabular font-mono text-mauve-400">{time(appointment.startsAt)}</span>
                <span className="min-w-0 flex-1 truncate text-mauve-600">
                  {appointment.customerName} · {appointment.serviceName}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.7rem] ${
                    appointment.status === 'completed'
                      ? 'bg-sage-500/15 text-sage-600'
                      : appointment.status === 'no_show'
                        ? 'bg-lacquer-500/10 text-lacquer-600'
                        : 'bg-blush-200 text-mauve-500'
                  }`}
                >
                  {appointment.status === 'no_show' ? 'no-show' : appointment.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

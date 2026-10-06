'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Swatch } from '@/components/swatch';
import { lacquerFor } from '@/lib/palette';
import { formatDuration, formatZar } from '@/lib/money';
import { formatPhoneForDisplay } from '@/lib/phone';

export interface BookableService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  staff: { id: string; name: string }[];
}

export interface BookableDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  monthLabel: string;
  isToday: boolean;
  open: boolean;
}

interface Slot {
  startsAt: string;
  label: string;
  staffName: string;
}

interface Confirmation {
  manageUrl: string;
  serviceName: string | null;
  staffName: string | null;
  startsAt: string;
  priceCents: number;
}

/** One booking attempt gets one key; a new choice of slot starts a new attempt. */
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BookingFlow({
  services,
  days,
  preselectedServiceId,
  minNoticeMinutes,
  businessName,
  businessPhone,
}: {
  services: BookableService[];
  days: BookableDay[];
  preselectedServiceId: string | null;
  minNoticeMinutes: number;
  businessName: string;
  businessPhone: string;
}) {
  const [serviceId, setServiceId] = useState<string | null>(
    services.some((s) => s.id === preselectedServiceId) ? preselectedServiceId : null,
  );

  /**
   * Is the treatment list open?
   *
   * -------------------------------------------------------------------------
   * WHY THE LIST COLLAPSES INSTEAD OF STAYING PUT.
   *
   * This flow was built for six treatments, where every step fitted on one
   * screen and leaving the list open cost nothing. The real menu is 43, which
   * is about three thousand pixels — so a guest who tapped the second
   * treatment saw nothing happen and had to scroll past forty-one others to
   * reach "Pick a day". Several reported it as the page being broken, which
   * is the right reading: nothing visibly responded to the tap.
   *
   * Collapsing to a single row puts step 2 immediately under the thumb that
   * just tapped, and the page goes from ~3000px to under one screen. Reopening
   * is one tap on "Change".
   * -------------------------------------------------------------------------
   */
  const [listOpen, setListOpen] = useState(
    !services.some((s) => s.id === preselectedServiceId),
  );
  /**
   * Scroll targets. Each carries `scroll-mt-24` in the markup.
   *
   * The site header is `sticky top-0` and 65px tall, so `scrollIntoView` with
   * `block: 'start'` puts the element's top at y=0 — underneath the header,
   * which then covers the very heading the guest was sent to read. The scroll
   * margin reserves room for it. This applied to the slot and details scrolls
   * before this change too; it was simply less visible when the page was six
   * treatments long and those scrolls rarely moved far.
   */
  const therapistRef = useRef<HTMLDivElement>(null);
  const [staffId, setStaffId] = useState<string>('any');
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const idempotencyKey = useRef<string>(newIdempotencyKey());
  const detailsRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);

  /** The menu, grouped under the studio's own poster headings. */
  const serviceGroups = useMemo(
    () => [
      ...services.reduce((map, item) => {
        const label = item.description?.trim() ?? '';
        // Only short labels are categories; a real sentence is a description.
        const key = label.length > 0 && label.length <= 30 ? label : '';
        return map.set(key, [...(map.get(key) ?? []), item]);
      }, new Map<string, BookableService[]>()),
    ],
    [services],
  );

  /**
   * Name the therapist under each time only when the names actually differ.
   * With one therapist covering the whole day, repeating her name on twenty
   * buttons is noise that reads as "only she is available".
   */
  const showStaffNames = useMemo(
    () => new Set(slots.map((s) => s.staffName).filter(Boolean)).size > 1,
    [slots],
  );

  // Which date the loaded slots describe. Without this we cannot tell "no
  // times on this day" apart from "not fetched yet".
  const [slotsForDate, setSlotsForDate] = useState<string | null>(null);
  const [pickedDayManually, setPickedDayManually] = useState(false);
  const autoAdvances = useRef(0);

  // The first open day is a better default than today, which is often closed.
  useEffect(() => {
    if (serviceId && !date) {
      const firstOpen = days.find((day) => day.open);
      if (firstOpen) setDate(firstOpen.date);
    }
  }, [serviceId, date, days]);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !date) return;
    setLoadingSlots(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/availability?service=${serviceId}&date=${date}&staff=${staffId}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('availability request failed');
      const data = (await response.json()) as { slots: Slot[] };
      setSlots(data.slots);
      setSlotsForDate(date);
    } catch {
      setError('We could not load times just now. Check your connection and try again.');
      setSlots([]);
      setSlotsForDate(date);
    } finally {
      setLoadingSlots(false);
    }
  }, [serviceId, date, staffId]);

  /**
   * Skip forward to the first day that actually has times.
   *
   * The default day is the first day the studio is open, which is usually
   * today — and today is frequently already fully booked or inside the
   * minimum-notice window. Landing on "Nothing left on this day" costs the
   * customer taps for no reason, and the whole point is booking in under a
   * minute. Only auto-advances while the customer has not chosen a day
   * herself, and is bounded so a fully-booked fortnight cannot loop.
   */
  useEffect(() => {
    if (pickedDayManually || loadingSlots || !date) return;
    if (slotsForDate !== date || slots.length > 0) return;
    if (autoAdvances.current >= 14) return;

    const nextOpen = days.find((day) => day.open && day.date > date);
    if (nextOpen) {
      autoAdvances.current += 1;
      setDate(nextOpen.date);
    }
  }, [pickedDayManually, loadingSlots, date, slotsForDate, slots, days]);

  useEffect(() => {
    setSlot(null);
    void loadSlots();
  }, [loadSlots]);

  function chooseService(nextId: string) {
    setServiceId(nextId);
    setStaffId('any');
    setSlot(null);
    setListOpen(false);
    // The list above has just collapsed, so the page is far shorter than it
    // was and the current scroll position may be past the end of it. Put the
    // next step where the guest is looking.
    requestAnimationFrame(() =>
      therapistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  function chooseSlot(next: Slot) {
    setSlot(next);
    // A different slot is a different booking attempt.
    idempotencyKey.current = newIdempotencyKey();
    setError(null);
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!service || !slot || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: service.id,
          staff_id: staffId,
          starts_at: slot.startsAt,
          name,
          phone,
          email: email || undefined,
          idempotency_key: idempotencyKey.current,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // §5 step 8. Re-render the picker with what is actually free.
        setSlots(data.slots ?? []);
        setSlot(null);
        setError(data.message ?? 'That time has just gone. Please pick another.');
        idempotencyKey.current = newIdempotencyKey();
        requestAnimationFrame(() =>
          slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        );
        return;
      }

      if (!response.ok) {
        setError(data.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setConfirmation({
        manageUrl: data.manage_url,
        serviceName: data.appointment.service_name,
        staffName: data.appointment.staff_name,
        startsAt: data.appointment.starts_at,
        priceCents: data.appointment.price_cents,
      });
    } catch {
      setError('We could not reach the booking system. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------- confirmed
  if (confirmation && service) {
    return (
      <div className="mx-auto max-w-xl px-5 pt-16 pb-4 sm:pt-24">
        <div className="flex items-start gap-5">
          <Swatch serviceName={service.name} size="chip" />
          <div>
            <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Confirmed</p>
            <h1 className="font-display mt-3 text-[2.25rem] leading-tight font-semibold text-aubergine-900">
              You&rsquo;re booked in.
            </h1>
          </div>
        </div>

        <dl className="mt-9 divide-y divide-blush-200 border-y border-blush-200">
          <Row term="Treatment" detail={confirmation.serviceName ?? service.name} />
          <Row term="When" detail={longDateTime(confirmation.startsAt)} mono />
          <Row term="With" detail={confirmation.staffName ?? ''} />
          <Row term="Price" detail={formatZar(confirmation.priceCents)} />
        </dl>

        <p className="mt-6 text-sm leading-relaxed text-mauve-500">
          Need to move or cancel it? Use the link below, no need to phone. You can change it up to{' '}
          {minNoticeMinutes / 60} hours before your appointment.
        </p>

        <div className="mt-7 flex flex-wrap gap-4">
          <Link
            href={confirmation.manageUrl}
            className="rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
          >
            Manage this booking
          </Link>
          <Link
            href="/"
            className="rounded-full border border-aubergine-900/25 px-6 py-3 text-sm hover:bg-blush-100"
          >
            Back to the site
          </Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ picking
  return (
    <div className="mx-auto max-w-2xl px-5 pt-12 pb-32 sm:pt-16">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Book</p>
      <h1 className="font-display mt-3 text-[2.25rem] leading-[1.05] font-semibold text-aubergine-900 sm:text-5xl">
        Four taps, then your details.
      </h1>

      {/* 1 — treatment */}
      <Step index="1" title={service && !listOpen ? 'Your treatment' : 'Choose a treatment'}>
        {service && !listOpen ? (
          /* Chosen: one row, and a way back. */
          <div className="flex items-center gap-4 rounded-xl border border-aubergine-900 bg-blush-100 px-4 py-3.5">
            <Swatch serviceName={service.name} size="dot" />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.98rem] leading-tight text-aubergine-900">
                {service.name}
              </span>
              <span className="tabular mt-0.5 block text-xs text-mauve-400">
                {formatDuration(service.durationMinutes)} · {formatZar(service.priceCents)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="shrink-0 rounded-full border border-aubergine-900/25 px-4 py-2 text-sm text-aubergine-900 transition-colors hover:bg-blush-200"
            >
              Change
            </button>
          </div>
        ) : (
          /* Open: grouped, because 43 treatments in one flat list is a
             scroll rather than a choice. The headings are the studio's own,
             carried on `description` — anything without a short category
             falls into one unheaded group so nothing is ever hidden. */
          <div className="space-y-6">
            {serviceGroups.map(([heading, items]) => (
              <div key={heading || 'all'}>
                {heading && (
                  <h3 className="mb-2 font-mono text-[0.65rem] tracking-[0.14em] text-gilt-600 uppercase">
                    {heading}
                  </h3>
                )}
                <ul className="space-y-2">
                  {items.map((item) => {
            const selected = item.id === serviceId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => chooseService(item.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                    selected
                      ? 'border-aubergine-900 bg-blush-100'
                      : 'border-blush-200 hover:border-blush-300 hover:bg-blush-100/60'
                  }`}
                >
                  <Swatch serviceName={item.name} size="dot" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.98rem] leading-tight text-aubergine-900">
                      {item.name}
                    </span>
                    <span className="tabular mt-0.5 block text-xs text-mauve-400">
                      {formatDuration(item.durationMinutes)}
                    </span>
                  </span>
                  <span className="tabular text-sm font-medium text-aubergine-900">
                    {formatZar(item.priceCents)}
                  </span>
                </button>
              </li>
            );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Step>

      {/* 2 — therapist */}
      {service && (
        <div ref={therapistRef} className="scroll-mt-24">
        <Step index="2" title="Anyone, or someone in particular?">
          <div className="flex flex-wrap gap-2">
            <Chip label="Anyone" selected={staffId === 'any'} onClick={() => setStaffId('any')} />
            {service.staff.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                selected={staffId === member.id}
                onClick={() => setStaffId(member.id)}
              />
            ))}
          </div>
          {staffId === 'any' && (
            <p className="mt-3 text-xs text-mauve-400">
              Picking &ldquo;Anyone&rdquo; usually means more times to choose from.
            </p>
          )}
        </Step>
        </div>
      )}

      {/* 3 — day */}
      {service && (
        <Step index="3" title="Pick a day">
          <div className="scrollbar-none -mx-5 overflow-x-auto px-5">
            <div className="flex w-max gap-2">
              {days.map((day) => {
                const selected = day.date === date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={!day.open}
                    onClick={() => {
                      setPickedDayManually(true);
                      setDate(day.date);
                    }}
                    aria-pressed={selected}
                    className={`w-16 shrink-0 rounded-xl border px-2 py-3 text-center transition-colors ${
                      !day.open
                        ? 'cursor-not-allowed border-blush-100 text-mauve-400/50'
                        : selected
                          ? 'border-aubergine-900 bg-aubergine-900 text-blush-50'
                          : 'border-blush-200 text-aubergine-900 hover:border-blush-300 hover:bg-blush-100'
                    }`}
                  >
                    <span className="block text-[0.65rem] tracking-wider uppercase">
                      {day.isToday ? 'Today' : day.weekdayLabel}
                    </span>
                    <span className="tabular mt-1 block font-mono text-lg leading-none">
                      {day.dayLabel}
                    </span>
                    <span className="mt-1 block text-[0.6rem] tracking-wide uppercase opacity-70">
                      {day.monthLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Step>
      )}

      {/* 4 — time */}
      {service && date && (
        <div ref={slotsRef} className="scroll-mt-24">
          <Step index="4" title="Pick a time">
            {loadingSlots ? (
              <p className="py-6 text-sm text-mauve-400">Checking what&rsquo;s free…</p>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-blush-200 bg-blush-100 px-5 py-6">
                <p className="text-sm text-aubergine-900">Nothing left on this day.</p>
                <p className="mt-1.5 text-sm text-mauve-500">
                  Try another day, or choose &ldquo;Anyone&rdquo; to see every therapist&rsquo;s
                  times.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((option) => {
                  const selected = slot?.startsAt === option.startsAt;
                  return (
                    <li key={option.startsAt}>
                      <button
                        type="button"
                        onClick={() => chooseSlot(option)}
                        aria-pressed={selected}
                        className={`w-full rounded-xl border px-2 py-3 transition-colors ${
                          selected
                            ? 'border-aubergine-900 bg-aubergine-900 text-blush-50'
                            : 'border-blush-200 text-aubergine-900 hover:border-blush-300 hover:bg-blush-100'
                        }`}
                      >
                        <span className="tabular block font-mono text-[0.95rem] leading-none">
                          {option.label}
                        </span>
                        {showStaffNames && option.staffName && (
                          <span className="mt-1 block text-[0.65rem] opacity-70">
                            {option.staffName}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Step>
        </div>
      )}

      {/* 5 — details */}
      {service && slot && (
        <div ref={detailsRef} className="scroll-mt-24">
          <Step index="5" title="Your details">
            <form onSubmit={submit} className="space-y-4">
              <Field
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
                required
                placeholder="Thandi Mahlangu"
              />
              <Field
                label="Mobile number"
                value={phone}
                onChange={setPhone}
                type="tel"
                autoComplete="tel"
                required
                inputMode="tel"
                placeholder="082 123 4567"
                hint="We send your confirmation and any changes here."
              />
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                hint="Optional, for an emailed confirmation you can keep."
              />

              {error && (
                <p role="alert" className="rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
                  {error}
                </p>
              )}

              {/*
                POPIA notice at the point of collection — spec §1.4 and §9.1.
                It sits ABOVE the button on purpose: a notice underneath the
                thing it is meant to inform is a notice given after the fact.
                Name and phone are personal information whether the business
                has two staff or two thousand, so this is not optional, and it
                costs one line.
              */}
              <p className="text-xs leading-relaxed text-mauve-400">
                Your name and number go to {businessName}, who use them for this booking and
                nothing else. No marketing, ever. You can have them erased at any time from the
                link we send you.{' '}
                <Link href="/privacy" className="underline underline-offset-4 hover:text-mauve-500">
                  How we handle your details
                </Link>
                .
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-lacquer-500 px-6 py-4 text-base font-medium text-blush-50 transition-colors hover:bg-lacquer-600 disabled:opacity-60"
              >
                {submitting ? 'Confirming…' : `Confirm · ${formatZar(service.priceCents)}`}
              </button>

              <p className="text-center text-xs text-mauve-400">
                No payment now. You pay in studio.
              </p>
            </form>
          </Step>
        </div>
      )}

      {error && !slot && (
        <p role="alert" className="mt-6 rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
          {error}{' '}
          <a href={`tel:${businessPhone}`} className="underline underline-offset-4">
            Or call {formatPhoneForDisplay(businessPhone)}
          </a>
        </p>
      )}

      {/* Standing summary so the choices stay visible while scrolling on a phone. */}
      {service && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gilt-200/70 bg-blush-50/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
            <Swatch serviceName={service.name} size="dot" />
            <p className="min-w-0 flex-1 truncate text-sm text-aubergine-900">
              {service.name}
              {slot && (
                <span className="tabular font-mono text-mauve-500"> · {slot.label}</span>
              )}
            </p>
            <p className="tabular text-sm font-medium text-aubergine-900">
              {formatZar(service.priceCents)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- small parts

function Step({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-11 border-t border-gilt-200/70 pt-7">
      <h2 className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-gilt-600">{index}</span>
        <span className="font-display text-xl font-semibold text-aubergine-900">{title}</span>
      </h2>
      <div className="mt-5">{children}</div>
    </section>
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
          : 'border-blush-200 text-aubergine-900 hover:border-blush-300 hover:bg-blush-100'
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-aubergine-900">
        {label}
        {!rest.required && <span className="ml-1.5 text-xs text-mauve-400">optional</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base text-aubergine-900 placeholder:text-mauve-400/70 focus:border-aubergine-900 focus:outline-none"
        {...rest}
      />
      {hint && <p className="mt-1.5 text-xs text-mauve-400">{hint}</p>}
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

function longDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

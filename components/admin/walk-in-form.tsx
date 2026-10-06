'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWalkInAction } from '@/app/admin/actions';
import { VoucherRedeem } from '@/components/admin/voucher-redeem';
import { formatDuration, formatZar } from '@/lib/money';
import type { ClashSummary } from '@/lib/booking';

interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  staffIds: string[];
}

/**
 * Walk-ins skip working hours and minimum notice — the customer is already
 * standing there. They do NOT skip double-booking checks (§7.1), so a clash
 * comes back naming the booking in the way.
 */
export function WalkInForm({
  today,
  services,
  staff,
}: {
  today: string;
  services: ServiceOption[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    clashesWith?: ClashSummary[];
  } | null>(null);
  const [justBooked, setJustBooked] = useState<{ appointmentId: string; priceCents: number } | null>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const eligibleStaff = useMemo(
    () => staff.filter((member) => service?.staffIds.includes(member.id)),
    [staff, service],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!serviceId || !staffId || !date || !time) return;

    // Send the wall clock as typed. The server converts it using the studio's
    // timezone (§12) — building a Date here would silently use whatever zone
    // this device is set to.
    startTransition(async () => {
      const response = await createWalkInAction({
        serviceId,
        staffId,
        date,
        time,
        name,
        phone,
        notes: notes || undefined,
      });
      setResult(response as typeof result);
      if (response.ok) {
        setName('');
        setPhone('');
        setNotes('');
        setTime('');
        setJustBooked(
          response.appointmentId ? { appointmentId: response.appointmentId, priceCents: response.priceCents ?? 0 } : null,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="pt-6">
      <h1 className="font-display text-2xl font-semibold text-aubergine-900">Add a walk-in</h1>
      <p className="mt-1 text-sm text-mauve-500">
        Goes on the diary the same way an online booking does, so the two never drift apart.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Select
          label="Treatment"
          value={serviceId}
          onChange={(value) => {
            setServiceId(value);
            setStaffId('');
          }}
          options={services.map((s) => ({
            value: s.id,
            label: `${s.name} · ${formatDuration(s.durationMinutes)} · ${formatZar(s.priceCents)}`,
          }))}
        />

        <Select
          label="Therapist"
          value={staffId}
          onChange={setStaffId}
          placeholder="Choose a therapist"
          options={eligibleStaff.map((member) => ({ value: member.id, label: member.name }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={date} onChange={setDate} required />
          <Field label="Start time" type="time" value={time} onChange={setTime} required step={900} />
        </div>

        <Field label="Name" value={name} onChange={setName} required placeholder="Walk-in customer" />
        <Field
          label="Mobile number"
          type="tel"
          value={phone}
          onChange={setPhone}
          required
          placeholder="082 123 4567"
        />
        <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />

        {result && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              result.ok ? 'bg-sage-500/15 text-sage-600' : 'bg-lacquer-500/10 text-lacquer-600'
            }`}
          >
            <p>{result.message}</p>

            {/* §7.1: "If the constraint rejects her edit, show her what it
                clashes with." */}
            {result.clashesWith && result.clashesWith.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {result.clashesWith.map((clash) => (
                  <li key={clash.appointment_id}>
                    Clashes with {clash.customer_name}: {clash.service_name}, {clash.staff_name}
                    {clash.reason === 'resource' && clash.resource_name && ` (${clash.resource_name})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* §4: "add it to the walk-in form, where a voucher is at least as
            likely." Shown against the booking that was just created. */}
        {justBooked && (
          <VoucherRedeem
            appointmentId={justBooked.appointmentId}
            priceCents={justBooked.priceCents}
            onRedeemed={() => setJustBooked(null)}
          />
        )}

        <button
          type="submit"
          disabled={pending || !staffId}
          className="w-full rounded-full bg-lacquer-500 px-6 py-3.5 text-base font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
        >
          {pending ? 'Booking…' : 'Add to the diary'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = `wi-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-aubergine-900">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = `wi-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-aubergine-900">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

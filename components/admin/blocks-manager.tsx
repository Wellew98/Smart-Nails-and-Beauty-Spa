'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBlockAction, deleteBlockAction } from '@/app/admin/actions';
import { ConflictList } from './conflict-list';
import type { AppointmentDetail } from '@/lib/booking';

interface Block {
  id: string;
  subject: string;
  kind: 'staff' | 'resource';
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export function BlocksManager({
  today,
  timezone,
  staff,
  resources,
  blocks,
}: {
  today: string;
  timezone: string;
  staff: { id: string; name: string }[];
  resources: { id: string; name: string }[];
  blocks: Block[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [target, setTarget] = useState(staff[0] ? `staff:${staff[0].id}` : '');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reason, setReason] = useState('');

  const [conflicts, setConflicts] = useState<AppointmentDetail[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save(confirm: boolean) {
    const [kind, id] = target.split(':');
    startTransition(async () => {
      const result = await createBlockAction({
        staffId: kind === 'staff' ? id : null,
        resourceId: kind === 'resource' ? id : null,
        date,
        startTime,
        endTime,
        reason: reason || undefined,
        confirm,
      });

      if (result.ok) {
        setConflicts(null);
        setMessage({ ok: true, text: result.message ?? 'Time blocked.' });
        setReason('');
        router.refresh();
      } else {
        // §7.1: list what is already in that window and let the owner decide.
        // Nothing is cancelled automatically.
        setConflicts(result.conflicts ?? []);
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-ZA', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));

  return (
    <div className="pt-6">
      <h1 className="font-display text-2xl font-semibold text-aubergine-900">Block time</h1>
      <p className="mt-1 text-sm text-mauve-500">
        Leave, a dentist appointment, a public holiday, or a room out of service.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
        className="mt-7 space-y-4"
      >
        <div>
          <label htmlFor="target" className="block text-sm text-aubergine-900">
            What is unavailable
          </label>
          <select
            id="target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
          >
            <optgroup label="Therapist">
              {staff.map((member) => (
                <option key={member.id} value={`staff:${member.id}`}>
                  {member.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Room or equipment">
              {resources.map((resource) => (
                <option key={resource.id} value={`resource:${resource.id}`}>
                  {resource.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" type="date" value={date} onChange={setDate} required />
          <Field label="From" type="time" value={startTime} onChange={setStartTime} required />
          <Field label="To" type="time" value={endTime} onChange={setEndTime} required />
        </div>

        <Field label="Reason" value={reason} onChange={setReason} placeholder="Optional" />

        {message && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              message.ok ? 'bg-sage-500/15 text-sage-600' : 'bg-lacquer-500/10 text-lacquer-600'
            }`}
          >
            <p>{message.text}</p>
            {conflicts && conflicts.length > 0 && (
              <>
                <ConflictList conflicts={conflicts} timezone={timezone} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(true)}
                    className="rounded-full bg-aubergine-900 px-4 py-2 text-xs text-blush-50 disabled:opacity-60"
                  >
                    Block it anyway, keep those bookings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConflicts(null);
                      setMessage(null);
                    }}
                    className="rounded-full border border-blush-300 px-4 py-2 text-xs"
                  >
                    Leave it
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-lacquer-500 px-6 py-3.5 text-base font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Block this time'}
        </button>
      </form>

      <h2 className="mt-11 text-xs tracking-[0.18em] text-gilt-600 uppercase">Blocked ahead</h2>
      {blocks.length === 0 ? (
        <p className="mt-3 text-sm text-mauve-400">Nothing blocked.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex items-center gap-3 rounded-xl border border-blush-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-aubergine-900">
                  {block.subject}
                  {block.reason && <span className="text-mauve-500"> · {block.reason}</span>}
                </p>
                <p className="tabular mt-0.5 font-mono text-xs text-mauve-400">
                  {fmt(block.startsAt)} – {fmt(block.endsAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteBlockAction(block.id);
                    router.refresh();
                  })
                }
                className="rounded-full border border-blush-300 px-3 py-1.5 text-xs hover:bg-blush-100 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
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
  const id = `bl-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-aubergine-900">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-3 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Swatch } from '@/components/swatch';
import { ConflictList } from './conflict-list';
import {
  createStaffAction,
  deactivateResourceAction,
  deactivateServiceAction,
  deactivateStaffAction,
  reactivateAction,
  renameResourceAction,
  renameStaffAction,
  setWorkingHoursAction,
  updateServiceAction,
  type ActionResult,
} from '@/app/admin/actions';
import { formatZar } from '@/lib/money';
import { DAY_NAMES } from '@/lib/site';
import type { AppointmentDetail } from '@/lib/booking';

interface ServiceRow {
  id: string;
  name: string;
  durationMinutes: number;
  turnaroundMinutes: number;
  priceCents: number;
  active: boolean;
}
interface NamedRow {
  id: string;
  name: string;
  active: boolean;
}
interface HoursRow {
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

type Feedback = { ok: boolean; text: string; conflicts?: AppointmentDetail[] } | null;

export function SettingsManager({
  timezone,
  services,
  staff,
  resources,
  hours,
}: {
  timezone: string;
  services: ServiceRow[];
  staff: NamedRow[];
  resources: NamedRow[];
  hours: HoursRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  function run(key: string, action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      setFeedback((current) => ({
        ...current,
        [key]: {
          ok: result.ok,
          text: result.message ?? (result.ok ? 'Saved.' : 'That did not work.'),
          conflicts: result.ok ? undefined : result.conflicts,
        },
      }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-12 pt-6">
      <h1 className="font-display text-2xl font-semibold text-aubergine-900">Setup</h1>

      {/* ------------------------------------------------------ treatments */}
      <section>
        <h2 className="font-display text-lg font-semibold text-aubergine-900">Treatments</h2>
        <p className="mt-1 text-sm text-mauve-500">
          Changing a length or a price only affects new bookings. Anything already on the diary
          keeps the time and price it was booked at.
        </p>

        <ul className="mt-5 space-y-3">
          {services.map((service) => (
            <ServiceEditor
              key={service.id}
              service={service}
              pending={pending}
              feedback={feedback[`service:${service.id}`]}
              timezone={timezone}
              onSave={(patch) => run(`service:${service.id}`, () => updateServiceAction(service.id, patch))}
              onDeactivate={() =>
                run(`service:${service.id}`, () => deactivateServiceAction(service.id))
              }
              onReactivate={() =>
                run(`service:${service.id}`, () => reactivateAction('services', service.id))
              }
            />
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- staff */}
      <section>
        <h2 className="font-display text-lg font-semibold text-aubergine-900">Therapists</h2>
        <p className="mt-1 text-sm text-mauve-500">
          Change a name and press Save. A therapist with bookings ahead of her cannot be made
          inactive until those bookings are moved or cancelled.
        </p>
        <ToggleList
          rows={staff}
          pending={pending}
          feedback={feedback}
          timezone={timezone}
          keyPrefix="staff"
          nameLabel="Therapist name"
          onRename={(id, name) => run('staff:section', () => renameStaffAction(id, name))}
          onDeactivate={(id) => run(`staff:${id}`, () => deactivateStaffAction(id))}
          onReactivate={(id) => run(`staff:${id}`, () => reactivateAction('staff', id))}
        />
        {/* Renaming a sample row changes its id, so this note is kept at section
            level — a row-level one would unmount with the row it belongs to. */}
        <Note feedback={feedback['staff:section']} timezone={timezone} />
        <AddRow
          label="Add a therapist"
          placeholder="Her name"
          buttonText="Add therapist"
          pending={pending}
          onAdd={(name) => run('staff:section', () => createStaffAction(name))}
        />
      </section>

      {/* ------------------------------------------------------- resources */}
      <section>
        <h2 className="font-display text-lg font-semibold text-aubergine-900">Rooms and equipment</h2>
        <p className="mt-1 text-sm text-mauve-500">
          Same rules: rename and Save, and anything with bookings ahead of it has to be cleared
          before it can be taken out of service.
        </p>
        <ToggleList
          rows={resources}
          pending={pending}
          feedback={feedback}
          timezone={timezone}
          keyPrefix="resource"
          nameLabel="Room or equipment name"
          onRename={(id, name) => run('resource:section', () => renameResourceAction(id, name))}
          onDeactivate={(id) => run(`resource:${id}`, () => deactivateResourceAction(id))}
          onReactivate={(id) => run(`resource:${id}`, () => reactivateAction('resources', id))}
        />
        <Note feedback={feedback['resource:section']} timezone={timezone} />
      </section>

      {/* ----------------------------------------------------------- hours */}
      <section>
        <h2 className="font-display text-lg font-semibold text-aubergine-900">Working hours</h2>
        <p className="mt-1 text-sm text-mauve-500">
          Shortening a day shows you any booking that would fall outside it first. Nothing is ever
          cancelled for you.
        </p>

        <div className="mt-5 space-y-7">
          {staff
            .filter((member) => member.active)
            .map((member) => (
              <HoursEditor
                key={member.id}
                member={member}
                hours={hours.filter((row) => row.staffId === member.id)}
                pending={pending}
                feedback={feedback}
                timezone={timezone}
                onSave={(dayOfWeek, windows, confirm) =>
                  run(`hours:${member.id}:${dayOfWeek}`, () =>
                    setWorkingHoursAction({ staffId: member.id, dayOfWeek, windows, confirm }),
                  )
                }
              />
            ))}
        </div>
      </section>
    </div>
  );
}

// --------------------------------------------------------------------- parts

function Note({ feedback, timezone }: { feedback: Feedback; timezone: string }) {
  if (!feedback) return null;
  return (
    <div
      role="status"
      className={`mt-3 rounded-xl px-3.5 py-2.5 text-xs ${
        feedback.ok ? 'bg-sage-500/15 text-sage-600' : 'bg-lacquer-500/10 text-lacquer-600'
      }`}
    >
      <p>{feedback.text}</p>
      {feedback.conflicts && <ConflictList conflicts={feedback.conflicts} timezone={timezone} />}
    </div>
  );
}

function ServiceEditor({
  service,
  pending,
  feedback,
  timezone,
  onSave,
  onDeactivate,
  onReactivate,
}: {
  service: ServiceRow;
  pending: boolean;
  feedback: Feedback;
  timezone: string;
  onSave: (patch: {
    name: string;
    duration_minutes: number;
    turnaround_minutes: number;
    price_cents: number;
  }) => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [duration, setDuration] = useState(String(service.durationMinutes));
  const [turnaround, setTurnaround] = useState(String(service.turnaroundMinutes));
  const [rand, setRand] = useState(String(service.priceCents / 100));

  const trimmedName = name.trim();
  const dirty =
    trimmedName.length > 0 &&
    (trimmedName !== service.name ||
      Number(duration) !== service.durationMinutes ||
      Number(turnaround) !== service.turnaroundMinutes ||
      Math.round(Number(rand) * 100) !== service.priceCents);

  return (
    <li className="rounded-2xl border border-blush-200 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        {/* The swatch is derived from the saved name, so it follows a rename
            once the save lands rather than flickering as she types. */}
        <Swatch serviceName={service.name} size="dot" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Treatment name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            className="w-full rounded-lg border border-blush-300 px-2.5 py-2 text-sm font-medium text-aubergine-900 focus:border-aubergine-900 focus:outline-none"
          />
        </label>
        {!service.active && (
          <span className="rounded-full bg-blush-200 px-2.5 py-1 text-[0.7rem] text-mauve-500">
            hidden
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <Small label="Minutes" value={duration} onChange={setDuration} />
        <Small label="Cleanup after" value={turnaround} onChange={setTurnaround} />
        <Small label="Price (R)" value={rand} onChange={setRand} />
      </div>
      <p className="mt-1.5 text-[0.7rem] text-mauve-400">
        Cleanup after is the gap held before the next client — wiping down, sterilising,
        resetting the station. It is added on top of the treatment length.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            onSave({
              name: trimmedName,
              duration_minutes: Number(duration),
              turnaround_minutes: Number(turnaround),
              price_cents: Math.round(Number(rand) * 100),
            })
          }
          className="rounded-full bg-aubergine-900 px-4 py-2 text-xs text-blush-50 disabled:opacity-40"
        >
          Save
        </button>
        {service.active ? (
          <button
            type="button"
            disabled={pending}
            onClick={onDeactivate}
            className="rounded-full border border-blush-300 px-4 py-2 text-xs disabled:opacity-50"
          >
            Hide from booking
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onReactivate}
            className="rounded-full border border-blush-300 px-4 py-2 text-xs disabled:opacity-50"
          >
            Show again
          </button>
        )}
        <span className="tabular ml-auto self-center text-xs text-mauve-400">
          now {formatZar(service.priceCents)}
        </span>
      </div>

      <Note feedback={feedback} timezone={timezone} />
    </li>
  );
}

function ToggleList({
  rows,
  pending,
  feedback,
  timezone,
  keyPrefix,
  nameLabel,
  onRename,
  onDeactivate,
  onReactivate,
}: {
  rows: NamedRow[];
  pending: boolean;
  feedback: Record<string, Feedback>;
  timezone: string;
  keyPrefix: string;
  nameLabel: string;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  return (
    <ul className="mt-5 space-y-3">
      {rows.map((row) => (
        <ToggleRow
          // Re-keying a sample row on rename changes row.id, which remounts the
          // row and resets its draft. That is the behaviour we want: the draft
          // is now stale by definition.
          key={row.id}
          row={row}
          pending={pending}
          feedback={feedback[`${keyPrefix}:${row.id}`]}
          timezone={timezone}
          nameLabel={nameLabel}
          onRename={onRename}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      ))}
    </ul>
  );
}

function ToggleRow({
  row,
  pending,
  feedback,
  timezone,
  nameLabel,
  onRename,
  onDeactivate,
  onReactivate,
}: {
  row: NamedRow;
  pending: boolean;
  feedback: Feedback;
  timezone: string;
  nameLabel: string;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
}) {
  const [name, setName] = useState(row.name);
  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== row.name;

  return (
    <li className="rounded-2xl border border-blush-200 bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{nameLabel}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && dirty && !pending) onRename(row.id, trimmed);
            }}
            maxLength={80}
            className="w-full rounded-lg border border-blush-300 px-2.5 py-2 text-sm text-aubergine-900 focus:border-aubergine-900 focus:outline-none"
          />
        </label>

        {!row.active && <span className="text-xs text-mauve-400">inactive</span>}

        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => onRename(row.id, trimmed)}
          className="rounded-full bg-aubergine-900 px-4 py-2 text-xs text-blush-50 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (row.active ? onDeactivate(row.id) : onReactivate(row.id))}
          className="rounded-full border border-blush-300 px-4 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
        >
          {row.active ? 'Make inactive' : 'Reactivate'}
        </button>
      </div>
      <Note feedback={feedback} timezone={timezone} />
    </li>
  );
}

/** A single-field "add one of these" row. Clears itself on a successful add. */
function AddRow({
  label,
  placeholder,
  buttonText,
  pending,
  onAdd,
}: {
  label: string;
  placeholder: string;
  buttonText: string;
  pending: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  function submit() {
    if (!trimmed || pending) return;
    onAdd(trimmed);
    setName('');
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-dashed border-blush-300 px-4 py-3.5">
      <label className="min-w-0 flex-1">
        <span className="block text-[0.7rem] text-mauve-500">{label}</span>
        <input
          value={name}
          placeholder={placeholder}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          maxLength={80}
          className="mt-1 w-full rounded-lg border border-blush-300 px-2.5 py-2 text-sm text-aubergine-900 focus:border-aubergine-900 focus:outline-none"
        />
      </label>
      <button
        type="button"
        disabled={pending || trimmed.length === 0}
        onClick={submit}
        className="self-end rounded-full bg-aubergine-900 px-4 py-2 text-xs text-blush-50 disabled:opacity-40"
      >
        {buttonText}
      </button>
    </div>
  );
}

function HoursEditor({
  member,
  hours,
  pending,
  feedback,
  timezone,
  onSave,
}: {
  member: NamedRow;
  hours: HoursRow[];
  pending: boolean;
  feedback: Record<string, Feedback>;
  timezone: string;
  onSave: (
    dayOfWeek: number,
    windows: { start_time: string; end_time: string }[],
    confirm: boolean,
  ) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-aubergine-900">{member.name}</h3>
      <ul className="mt-2 space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <DayRow
            key={day}
            day={day}
            existing={hours.find((row) => row.dayOfWeek === day) ?? null}
            pending={pending}
            feedback={feedback[`hours:${member.id}:${day}`]}
            timezone={timezone}
            onSave={onSave}
          />
        ))}
      </ul>
    </div>
  );
}

function DayRow({
  day,
  existing,
  pending,
  feedback,
  timezone,
  onSave,
}: {
  day: number;
  existing: HoursRow | null;
  pending: boolean;
  feedback: Feedback;
  timezone: string;
  onSave: (
    dayOfWeek: number,
    windows: { start_time: string; end_time: string }[],
    confirm: boolean,
  ) => void;
}) {
  const [open, setOpen] = useState(Boolean(existing));
  const [start, setStart] = useState(existing?.startTime ?? '09:00');
  const [end, setEnd] = useState(existing?.endTime ?? '17:00');

  const windows = open ? [{ start_time: start, end_time: end }] : [];
  const needsConfirm = feedback && !feedback.ok && (feedback.conflicts?.length ?? 0) > 0;

  return (
    <li className="rounded-xl border border-blush-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex w-28 items-center gap-2 text-sm text-aubergine-900">
          <input
            type="checkbox"
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
            className="size-4 accent-[#2a1626]"
          />
          {DAY_NAMES[day]}
        </label>

        {open ? (
          <>
            <input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="tabular rounded-lg border border-blush-300 px-2.5 py-1.5 font-mono text-sm"
            />
            <span className="text-mauve-400">–</span>
            <input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="tabular rounded-lg border border-blush-300 px-2.5 py-1.5 font-mono text-sm"
            />
          </>
        ) : (
          <span className="text-sm text-mauve-400">Closed</span>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(day, windows, false)}
          className="ml-auto rounded-full border border-blush-300 px-3.5 py-1.5 text-xs hover:bg-blush-100 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <Note feedback={feedback} timezone={timezone} />

      {/* §7.1: the owner chooses. Keep them, or go back and cancel — never auto-cancel. */}
      {needsConfirm && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(day, windows, true)}
          className="mt-2 rounded-full bg-aubergine-900 px-4 py-2 text-xs text-blush-50 disabled:opacity-60"
        >
          Save anyway, keep those bookings
        </button>
      )}
    </li>
  );
}

function Small({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[0.7rem] text-mauve-500">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tabular mt-1 w-full rounded-lg border border-blush-300 px-2.5 py-2 text-sm focus:border-aubergine-900 focus:outline-none"
      />
    </label>
  );
}

import { formatPhoneForDisplay } from '@/lib/phone';
import type { AppointmentDetail } from '@/lib/booking';

/**
 * The bookings a config change would affect.
 *
 * Spec §7.1 asks for the same thing on every guarded save: "Present the
 * result. Do not proceed until the owner has chosen." A count alone is not
 * enough — she needs the names and times to decide, and to phone anyone she
 * ends up moving.
 */
export function ConflictList({
  conflicts,
  timezone,
}: {
  conflicts: AppointmentDetail[];
  timezone: string;
}) {
  if (conflicts.length === 0) return null;

  const when = (value: Date | string) =>
    new Intl.DateTimeFormat('en-ZA', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));

  return (
    <ul className="mt-3 space-y-2">
      {conflicts.map((appointment) => (
        <li key={appointment.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
          <p className="tabular font-mono text-aubergine-900">{when(appointment.starts_at)}</p>
          <p className="mt-0.5 text-mauve-600">
            {appointment.customer_name} · {appointment.service_name} · {appointment.staff_name}
          </p>
          <a
            href={`tel:${appointment.customer_phone}`}
            className="text-lacquer-500 underline underline-offset-2"
          >
            {formatPhoneForDisplay(appointment.customer_phone)}
          </a>
        </li>
      ))}
    </ul>
  );
}

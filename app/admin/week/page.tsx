import Link from 'next/link';
import { Swatch } from '@/components/swatch';
import { getAppointmentsBetween } from '@/lib/booking';
import { getAllStaff, getBusiness } from '@/lib/public-data';
import { requireOwner } from '@/lib/supabase/session';
import { addDays, todayInZone, utcToZonedDate, zonedToUtc } from '@/lib/time';
import { DAY_SHORT } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** §7 screen 2 — week calendar, a column per staff member. */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await requireOwner();
  const params = await searchParams;

  const business = (await getBusiness())!;
  const today = todayInZone(business.timezone);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? '') ? params.from! : today;
  const to = addDays(from, 7);

  const [staff, appointments] = await Promise.all([
    getAllStaff(business.id),
    getAppointmentsBetween(
      business.id,
      zonedToUtc(from, '00:00', business.timezone),
      zonedToUtc(to, '00:00', business.timezone),
    ),
  ]);

  const live = appointments.filter((a) => a.status === 'pending' || a.status === 'confirmed');
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));

  const time = (value: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: business.timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);

  return (
    <div className="pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-aubergine-900">Week</h1>
        <p className="tabular text-sm text-mauve-500">{live.length} booked</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/admin/week?from=${addDays(from, -7)}`}
          className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
        >
          ← Previous
        </Link>
        <Link
          href="/admin/week"
          className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
        >
          This week
        </Link>
        <Link
          href={`/admin/week?from=${addDays(from, 7)}`}
          className="rounded-full border border-blush-300 px-3 py-1.5 text-sm hover:bg-blush-100"
        >
          Next →
        </Link>
      </div>

      <div className="mt-6 space-y-5">
        {days.map((day) => {
          const dayAppointments = live.filter(
            (a) => utcToZonedDate(new Date(a.starts_at), business.timezone) === day,
          );
          const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();

          return (
            <section key={day}>
              <div className="flex items-baseline gap-2 border-b border-gilt-200/70 pb-2">
                <h2 className="font-display text-lg font-semibold text-aubergine-900">
                  {DAY_SHORT[weekday]} {Number(day.slice(8, 10))}
                </h2>
                {day === today && (
                  <span className="rounded-full bg-aubergine-900 px-2 py-0.5 text-[0.65rem] text-blush-50">
                    today
                  </span>
                )}
                <Link
                  href={`/admin?date=${day}`}
                  className="ml-auto text-xs text-lacquer-500 underline underline-offset-4"
                >
                  Open day
                </Link>
              </div>

              {dayAppointments.length === 0 ? (
                <p className="py-3 text-sm text-mauve-400">Nothing booked.</p>
              ) : (
                // A column per staff member, scrolling sideways when there are
                // more therapists than fit a phone.
                <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
                  <div className="flex min-w-full gap-3 pt-3">
                    {staff.map((member) => {
                      const theirs = dayAppointments.filter((a) => a.staff_id === member.id);
                      return (
                        <div key={member.id} className="w-44 shrink-0">
                          <p className="text-xs font-medium tracking-wide text-mauve-500">
                            {member.name}
                            {!member.active && ' (inactive)'}
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {theirs.length === 0 ? (
                              <li className="rounded-lg border border-dashed border-blush-200 px-3 py-2 text-xs text-mauve-400">
                                Free
                              </li>
                            ) : (
                              theirs.map((appointment) => (
                                <li
                                  key={appointment.id}
                                  className="flex gap-2 rounded-lg border border-blush-200 bg-white px-3 py-2"
                                >
                                  <Swatch serviceName={appointment.service_name} size="dot" />
                                  <div className="min-w-0">
                                    <p className="tabular font-mono text-xs text-aubergine-900">
                                      {time(new Date(appointment.starts_at))}
                                    </p>
                                    <p className="truncate text-xs text-mauve-600">
                                      {appointment.customer_name}
                                    </p>
                                    <p className="truncate text-[0.65rem] text-mauve-400">
                                      {appointment.service_name}
                                    </p>
                                  </div>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

import { TodayList } from '@/components/admin/today-list';
import { getAppointmentsBetween } from '@/lib/booking';
import { getBusiness } from '@/lib/public-data';
import { requireOwner } from '@/lib/supabase/session';
import { addDays, todayInZone, zonedToUtc } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * §7 screen 1 — a single scrollable day. Time, service, customer, staff, phone
 * with a wa.me link. Built for a phone in one hand.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireOwner();
  const params = await searchParams;

  const business = (await getBusiness())!;
  const today = todayInZone(business.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today;

  const from = zonedToUtc(date, '00:00', business.timezone);
  const to = zonedToUtc(addDays(date, 1), '00:00', business.timezone);

  const appointments = await getAppointmentsBetween(business.id, from, to);

  return (
    <TodayList
      date={date}
      today={today}
      timezone={business.timezone}
      businessName={business.name}
      appointments={appointments.map((appointment) => ({
        id: appointment.id,
        startsAt: new Date(appointment.starts_at).toISOString(),
        endsAt: new Date(appointment.ends_at).toISOString(),
        blocksUntil: new Date(appointment.blocks_until).toISOString(),
        status: appointment.status,
        source: appointment.source,
        serviceName: appointment.service_name,
        staffName: appointment.staff_name,
        resourceName: appointment.resource_name,
        customerName: appointment.customer_name,
        customerPhone: appointment.customer_phone,
        priceCents: appointment.price_cents_at_booking,
        notes: appointment.notes,
      }))}
    />
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManageBooking } from '@/components/book/manage-booking';
import { getAppointmentByToken } from '@/lib/booking';
import { getBusiness, getOpeningHours, getStaffForService } from '@/lib/public-data';
import { addDays, dayOfWeekInZone, todayInZone } from '@/lib/time';
import { DAY_SHORT } from '@/lib/site';
import type { BookableDay } from '@/components/book/booking-flow';

// The token is a credential in a URL. Keep this page out of search results
// entirely, and never prerender it.
export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const appointment = await getAppointmentByToken(token);
  if (!appointment) notFound();

  const business = (await getBusiness())!;
  const [staff, openingHours] = await Promise.all([
    getStaffForService(appointment.service_id),
    getOpeningHours(business.id),
  ]);
  const openWeekdays = new Set(openingHours.map((entry) => entry.day));

  const today = todayInZone(business.timezone);
  const days: BookableDay[] = [];
  for (let offset = 0; offset <= Math.min(business.max_advance_days, 60); offset++) {
    const date = addDays(today, offset);
    const weekday = dayOfWeekInZone(date, business.timezone);
    days.push({
      date,
      weekdayLabel: DAY_SHORT[weekday],
      dayLabel: String(Number(date.slice(8, 10))),
      monthLabel: new Intl.DateTimeFormat('en-ZA', {
        timeZone: business.timezone,
        month: 'short',
      }).format(new Date(`${date}T12:00:00Z`)),
      isToday: offset === 0,
      open: openWeekdays.has(weekday),
    });
  }

  return (
    <ManageBooking
      token={token}
      appointment={{
        id: appointment.id,
        serviceId: appointment.service_id,
        serviceName: appointment.service_name,
        staffName: appointment.staff_name,
        startsAt: new Date(appointment.starts_at).toISOString(),
        endsAt: new Date(appointment.ends_at).toISOString(),
        status: appointment.status,
        priceCents: appointment.price_cents_at_booking,
        customerName: appointment.customer_name,
      }}
      staff={staff.map((member) => ({ id: member.id, name: member.name }))}
      days={days}
      timezone={business.timezone}
      minNoticeMinutes={business.min_notice_minutes}
      businessName={business.name}
      businessPhone={business.phone}
      businessWhatsapp={business.whatsapp}
    />
  );
}

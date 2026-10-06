import type { Metadata } from 'next';
import { BookingFlow, type BookableDay, type BookableService } from '@/components/book/booking-flow';
import { getActiveServices, getBusiness, getOpeningHours, getStaffForService } from '@/lib/public-data';
import { addDays, dayOfWeekInZone, todayInZone } from '@/lib/time';
import { DAY_SHORT } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Book',
  description: 'Pick a treatment, a therapist and a time. Live availability, confirmed instantly.',
};

// Availability is live; nothing on this page may be prerendered.
export const dynamic = 'force-dynamic';

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const params = await searchParams;
  const business = (await getBusiness())!;
  const services = await getActiveServices(business.id);

  const staffLists = await Promise.all(services.map((service) => getStaffForService(service.id)));
  const openingHours = await getOpeningHours(business.id);
  const openWeekdays = new Set(openingHours.map((entry) => entry.day));

  /**
   * The date strip is built here, in the business timezone, so the browser
   * never has to reason about zones — it receives finished labels and passes
   * back the date string it was given (§12: the server computes all times).
   */
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

  const bookable: BookableService[] = services.map((service, index) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    priceCents: service.price_cents,
    staff: staffLists[index].map((member) => ({ id: member.id, name: member.name })),
  }));

  return (
    <BookingFlow
      services={bookable}
      days={days}
      preselectedServiceId={params.service ?? null}
      minNoticeMinutes={business.min_notice_minutes}
      businessName={business.name}
      businessPhone={business.phone}
    />
  );
}

import type { Metadata } from 'next';
import { BookButton } from '@/components/book-button';
import { getBusiness, getOpeningHours } from '@/lib/public-data';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';
import { DAY_NAMES } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Where to find us, when we are open, and how to reach us.',
};

export default async function ContactPage() {
  const business = (await getBusiness())!;
  const hours = await getOpeningHours(business.id);
  const byDay = new Map(hours.map((entry) => [entry.day, entry]));

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14 pb-4 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Contact</p>
      <h1 className="font-display mt-4 max-w-[14ch] text-[2.5rem] leading-[1] font-semibold text-aubergine-900 sm:text-6xl">
        Booking online is quickest. But we do answer the phone.
      </h1>

      <div className="mt-12 grid gap-12 sm:grid-cols-2 sm:gap-16">
        <div>
          {/* NAP, rendered from the single businesses row (§8). */}
          <h2 className="text-xs tracking-[0.18em] text-gilt-600 uppercase">Find us</h2>
          <p className="font-display mt-4 text-xl font-semibold text-aubergine-900">
            {business.name}
          </p>
          {business.address && (
            <address className="mt-2 leading-relaxed text-mauve-600 not-italic">
              {business.address}
            </address>
          )}
          {business.google_maps_url && (
            <a
              href={business.google_maps_url}
              className="mt-3 inline-block text-sm text-lacquer-500 underline underline-offset-4 hover:text-lacquer-600"
            >
              Open in Google Maps
            </a>
          )}

          <h2 className="mt-10 text-xs tracking-[0.18em] text-gilt-600 uppercase">Reach us</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <a
                href={`tel:${business.phone}`}
                className="text-lg text-aubergine-900 hover:text-lacquer-500"
              >
                {formatPhoneForDisplay(business.phone)}
              </a>
            </li>
            {business.whatsapp && (
              <li>
                <a
                  href={whatsappLink(business.whatsapp, "Hi! I'd like to ask about a treatment.")}
                  className="inline-flex items-center gap-2 text-aubergine-900 hover:text-lacquer-500"
                >
                  WhatsApp {formatPhoneForDisplay(business.whatsapp)}
                </a>
              </li>
            )}
            {business.email && (
              <li>
                <a
                  href={`mailto:${business.email}`}
                  className="text-aubergine-900 hover:text-lacquer-500"
                >
                  {business.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-xs tracking-[0.18em] text-gilt-600 uppercase">Opening hours</h2>
          <dl className="mt-4 divide-y divide-blush-200 border-y border-blush-200">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const entry = byDay.get(day);
              return (
                <div key={day} className="flex items-baseline justify-between gap-6 py-3">
                  <dt className="text-[0.95rem] text-aubergine-900">{DAY_NAMES[day]}</dt>
                  <dd
                    className={`tabular font-mono text-sm ${entry ? 'text-mauve-600' : 'text-mauve-400'}`}
                  >
                    {entry ? `${entry.opens} – ${entry.closes}` : 'Closed'}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-8 rounded-2xl bg-blush-100 px-6 py-7">
            <p className="text-sm leading-relaxed text-mauve-600">
              Bookings close {business.min_notice_minutes / 60} hours before the appointment. Inside
              that window, phone us. If there is a gap we will take you.
            </p>
            <BookButton className="mt-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

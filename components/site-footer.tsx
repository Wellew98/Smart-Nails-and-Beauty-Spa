import Link from 'next/link';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';
import { DAY_SHORT, NAV } from '@/lib/site';
import type { Business } from '@/lib/types';

/**
 * The NAP block. Spec §8: name, address and phone render exactly as they
 * appear on the Google Business Profile — same words, same order, same
 * punctuation — because inconsistent NAP across the web is what stops a local
 * business ranking. All three come from the `businesses` row so there is only
 * ever one copy to keep true.
 */
export function SiteFooter({
  business,
  hours,
  chatWidgetPresent = false,
}: {
  business: Business;
  hours: { day: number; opens: string; closes: string }[];
  /**
   * Whether the floating chat button is on the page.
   *
   * REPORTED BUG: "Staff login" could not be tapped. The chat button is
   * `fixed right-4 bottom-4`, and the last row of the footer is the last thing
   * on the page — so once you scroll to the bottom, the button parks on top of
   * it and every tap lands on the button instead. Confirmed with
   * `elementFromPoint` on the link's own centre at 320, 360, 390 and 1280px.
   * It was never a phone-only problem; the corner is the corner at every width.
   *
   * The fix is to reserve the button's height at the foot of the page rather
   * than to move the button, which sits where it does on purpose. It is a prop
   * because the button is not always rendered: with no AI key configured the
   * layout ships no widget at all, and an empty 5rem strip under the copyright
   * line of a site that has no chat button is just a gap nobody can explain.
   */
  chatWidgetPresent?: boolean;
}) {
  const byDay = new Map(hours.map((entry) => [entry.day, entry]));

  return (
    <footer className="mt-24 border-t border-gilt-200/60 bg-blush-100">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:grid-cols-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-aubergine-900">
            {business.name}
          </h2>
          {business.address && (
            <address className="mt-3 text-sm leading-relaxed text-mauve-500 not-italic">
              {business.address}
            </address>
          )}
          {business.google_maps_url && (
            <a
              href={business.google_maps_url}
              className="mt-2 inline-block text-sm text-lacquer-500 underline underline-offset-4 hover:text-lacquer-600"
            >
              Get directions
            </a>
          )}
        </div>

        <div>
          <h3 className="text-xs tracking-[0.18em] text-gilt-600 uppercase">Opening hours</h3>
          <dl className="mt-3 space-y-1 text-sm text-mauve-500">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const entry = byDay.get(day);
              return (
                <div key={day} className="flex justify-between gap-4">
                  <dt>{DAY_SHORT[day]}</dt>
                  <dd className="tabular font-mono text-xs">
                    {entry ? `${entry.opens} – ${entry.closes}` : 'Closed'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div>
          <h3 className="text-xs tracking-[0.18em] text-gilt-600 uppercase">Get in touch</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href={`tel:${business.phone}`} className="text-aubergine-900 hover:text-lacquer-500">
                {formatPhoneForDisplay(business.phone)}
              </a>
            </li>
            {business.whatsapp && (
              <li>
                <a
                  href={whatsappLink(business.whatsapp)}
                  className="text-aubergine-900 hover:text-lacquer-500"
                >
                  WhatsApp us
                </a>
              </li>
            )}
            {business.email && (
              <li>
                <a href={`mailto:${business.email}`} className="text-aubergine-900 hover:text-lacquer-500">
                  {business.email}
                </a>
              </li>
            )}
          </ul>

          <ul className="mt-6 space-y-2 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-mauve-500 hover:text-aubergine-900">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-gilt-200/60">
        {/* flex-wrap so the three items drop to a second line rather than
            colliding at 320px, and the extra bottom padding keeps the last row
            clear of the chat button. */}
        <div
          className={`mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-5 ${
            chatWidgetPresent ? 'pb-24' : 'pb-5'
          }`}
        >
          <p className="text-xs text-mauve-400">
            © {new Date().getFullYear()} {business.name}
          </p>
          {/*
            POPIA (§9): the notice has to be reachable from anywhere on the
            site, not only from the point of collection on /book. Kept out of
            NAV — it is a legal footer link, not somewhere a customer browses.
          */}
          <Link
            href="/privacy"
            className="text-xs text-mauve-400 underline-offset-4 hover:text-aubergine-900 hover:underline"
          >
            Privacy
          </Link>
          {/*
            The only way in to the diary. The admin is deliberately not in the
            main navigation — customers have no use for it — but with no link
            anywhere the owner has to be told a URL and remember it, which is
            how a booking system quietly goes unused. Discreet, not hidden.
            The page itself is auth-gated, so linking it gives nothing away.
          */}
          <Link
            href="/admin"
            className="ml-auto text-xs text-mauve-400 underline-offset-4 hover:text-aubergine-900 hover:underline"
          >
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  );
}

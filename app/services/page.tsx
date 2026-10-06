import type { Metadata } from 'next';
import Link from 'next/link';
import { Swatch } from '@/components/swatch';
import { getActiveServices, getBusiness, getStaffForService } from '@/lib/public-data';
import { formatDuration, formatZar } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Treatments',
  description: 'Massage, facials, gel nails and pedicures. Prices and times, with live booking.',
};

/** Stable id for the group heading, so the section is properly labelled. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'other';
}

export default async function ServicesPage() {
  const business = (await getBusiness())!;
  const services = await getActiveServices(business.id);

  // Who performs what — a treatment offered by one therapist books up faster,
  // and saying so is more useful than hiding it.
  const therapists = await Promise.all(services.map((service) => getStaffForService(service.id)));

  /**
   * Grouped by the studio's own poster headings.
   *
   * `description` carries the category for menu rows that came from the
   * poster (migration 0006). Anything without one — a treatment typed straight
   * into Admin → Setup, or the older seeded data — falls into a single
   * unheaded group at the top, so the page never hides a service just because
   * it has no category.
   */
  const rows = services.map((service, index) => ({ service, staff: therapists[index] }));
  const groups = [...rows.reduce((map, row) => {
    const heading = row.service.description?.trim() ?? '';
    // Only short labels are categories. A real sentence is a description.
    const key = heading.length > 0 && heading.length <= 30 ? heading : '';
    return map.set(key, [...(map.get(key) ?? []), row]);
  }, new Map<string, typeof rows>())];

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14 pb-4 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">The range</p>
      <h1 className="font-display mt-4 max-w-[14ch] text-[2.5rem] leading-[1] font-semibold text-aubergine-900 sm:text-6xl">
        Every treatment, every price.
      </h1>
      <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-mauve-500">
        Times shown are the time you are on the table or at the desk. We block extra time behind
        every booking to turn the room around properly, so nobody is hurried out.
      </p>

      {/* ---------------------------------------------------------------
          A PRICE LIST, NOT 43 POSTERS.

          Each treatment used to get its own block — a shade name, a 3xl
          heading, a description, a therapist count and its own Book button.
          That reads beautifully for six treatments and is unusable for
          forty-three: a customer looking for the price of a lip wax had to
          scroll past forty full-height cards to find it.

          A salon menu is a list, so this is a list, grouped by the headings
          from the studio's own printed poster. The swatch stays as the row's
          colour, which keeps each treatment recognisable against the rest of
          the site without costing a whole screen.
      --------------------------------------------------------------------- */}
      {groups.map(([heading, rows]) => (
        <section key={heading} className="mt-14" aria-labelledby={`group-${slug(heading)}`}>
          {heading && (
            <h2
              id={`group-${slug(heading)}`}
              className="font-display border-b border-gilt-200/70 pb-3 text-xl font-semibold text-aubergine-900"
            >
              {heading}
            </h2>
          )}

          <ul>
            {rows.map(({ service, staff }) => (
              <li key={service.id}>
                <Link
                  href={`/book?service=${service.id}`}
                  className="group flex items-center gap-5 border-b border-blush-200 py-5 transition-colors hover:bg-blush-100/70"
                >
                  <Swatch serviceName={service.name} size="chip" />

                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.05rem] leading-tight text-aubergine-900">
                      {service.name}
                    </span>
                    <span className="mt-1 block text-xs tracking-wide text-mauve-400">
                      {formatDuration(service.duration_minutes)}
                      {/* Only worth saying when it actually narrows the choice.
                          With every therapist trained on everything it is noise. */}
                      {staff.length === 1 && ` · with ${staff[0].name}`}
                    </span>
                  </span>

                  <span className="tabular text-[0.95rem] font-medium text-aubergine-900">
                    {formatZar(service.price_cents)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-mauve-400 transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-16 rounded-2xl border border-gilt-200 bg-blush-100 px-7 py-9">
        <h2 className="font-display text-xl font-semibold text-aubergine-900">
          Not sure which to book?
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-mauve-500">
          Tell us what is bothering you and we will point you at the right treatment. No obligation,
          and no upselling.
        </p>
        <Link
          href="/contact"
          className="mt-5 inline-block text-sm text-lacquer-500 underline underline-offset-4 hover:text-lacquer-600"
        >
          Ask us
        </Link>
      </div>
    </div>
  );
}

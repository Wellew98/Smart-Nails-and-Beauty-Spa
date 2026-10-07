import type { Metadata } from 'next';
import { PriceList } from '@/components/price-list';
import { groupForFlyer } from '@/lib/flyer-prices';
import { getActiveServices, getBusiness } from '@/lib/public-data';

export const metadata: Metadata = {
  title: 'Prices',
  description:
    'Full price list, exactly as our flyer. Tap any item to book it online in seconds. Special Package R500.',
};

/**
 * Transparent pricing on its own page: the flyer's full price list,
 * price-only, with the search box. Every row deep-links into /book with
 * that treatment preselected (online-only booking, no WhatsApp links).
 * Prices come from the database, which was transcribed line by line from
 * the flyer (migration 0006), so the page cannot drift from the menu.
 */
export default async function PricesPage() {
  const business = (await getBusiness())!;
  const services = await getActiveServices(business.id);
  const groups = groupForFlyer(services);

  return (
    <section className="section prices" id="prices">
      <div className="wrap">
        <p className="eyebrow">Transparent pricing</p>
        <h2>Full price list</h2>
        <p className="sub">Price-only, exactly as our flyer. Tap any item to book it online.</p>
        <PriceList groups={groups} />
        <p className="fine">
          Appointments may be required. Prices as per in-store flyer — the booking page confirms
          the final price before you commit.
        </p>
      </div>
    </section>
  );
}

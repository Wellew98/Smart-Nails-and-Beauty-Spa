import type { Business, Service } from '@/lib/types';

/**
 * LocalBusiness JSON-LD — spec §8 Phase 1.
 *
 * Built from the same `businesses` row the footer renders, so the structured
 * data and the visible NAP can never disagree.
 *
 * `NailSalon` is a schema.org subtype of LocalBusiness and matches the Google
 * Business Profile's own primary category ("Nail salon"). Matching the profile
 * matters more than picking the grandest-sounding type: the profile and the
 * site should describe the same entity the same way.
 *
 * DELIBERATELY NO `aggregateRating` OR `review`.
 * The profile shows 3.7 from 77 reviews, and it is tempting to mark that up for
 * stars in search results. Google's structured-data guidelines forbid a site
 * marking up its own ratings about itself, and doing it risks a manual action
 * that costs far more than the stars are worth. Reviews belong on the Google
 * profile, which already shows them.
 */
/**
 * Split the single stored address into structured parts when it clearly has
 * them, e.g. "11 Amanda Ave, Glenanda, Johannesburg, 2091".
 *
 * `addressLocality` carries real weight for local search, so it is worth
 * emitting rather than dropping the whole string into `streetAddress`. The
 * shape is only trusted when the last part is a four-digit South African
 * postal code and there are four parts — anything else falls back to the whole
 * string, which is still valid. A parser that guessed would put a suburb in the
 * wrong field and quietly weaken the very signal it was added for.
 *
 * The stored address remains the single source of truth; the visible NAP always
 * renders it verbatim (§8).
 */
function postalAddress(address: string): Record<string, string> {
  const base = { '@type': 'PostalAddress', addressCountry: 'ZA' };
  const parts = address.split(',').map((part) => part.trim());

  if (parts.length === 4 && /^\d{4}$/.test(parts[3])) {
    // "11 Amanda Ave, Glenanda, Johannesburg, 2091"
    //   street ─┘         suburb ─┘      city ─┘  postal ─┘
    //
    // addressLocality is the town or city, so Johannesburg goes there and the
    // suburb stays with the street line. addressRegion means the province, and
    // the profile does not state one, so it is omitted rather than inferred.
    const [street, suburb, city, postalCode] = parts;
    return {
      ...base,
      streetAddress: `${street}, ${suburb}`,
      addressLocality: city,
      postalCode,
    };
  }

  return { ...base, streetAddress: address };
}

export function LocalBusinessJsonLd({
  business,
  services,
  hours,
  siteUrl,
}: {
  business: Business;
  services: Service[];
  hours: { day: number; opens: string; closes: string }[];
  siteUrl: string;
}) {
  const schemaDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ] as const;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['NailSalon', 'HealthAndBeautyBusiness'],
    '@id': `${siteUrl}/#business`,
    name: business.name,
    url: siteUrl,
    telephone: business.phone,
    priceRange: 'RR',
    currenciesAccepted: 'ZAR',
  };

  if (business.email) data.email = business.email;
  if (business.google_maps_url) data.hasMap = business.google_maps_url;

  if (business.address) data.address = postalAddress(business.address);

  if (hours.length > 0) {
    data.openingHoursSpecification = hours.map((entry) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${schemaDays[entry.day]}`,
      opens: entry.opens,
      closes: entry.closes,
    }));
  }

  if (services.length > 0) {
    data.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Treatments',
      itemListElement: services.map((service) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: service.name,
          ...(service.description ? { description: service.description } : {}),
        },
        price: (service.price_cents / 100).toFixed(2),
        priceCurrency: 'ZAR',
      })),
    };
  }

  data.potentialAction = {
    '@type': 'ReserveAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${siteUrl}/book`,
      actionPlatform: [
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/MobileWebPlatform',
      ],
    },
    result: { '@type': 'Reservation', name: 'Treatment booking' },
  };

  return (
    <script
      type="application/ld+json"
      // Server-rendered from our own database row, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

import type { Service } from './types';

/**
 * The flyer's own category headings, in flyer order.
 *
 * The database stores the category in `services.description` (migration
 * 0006); these labels are the display form of those values. Anything with
 * no recognised category falls into an unheaded group at the top so the
 * page never hides a service.
 */
const HEADINGS: { match: string; label: string }[] = [
  { match: 'special package', label: 'Special Package' },
  { match: 'nails', label: 'Nails' },
  { match: 'gel', label: 'Gel Application' },
  { match: 'pedicure', label: 'Pedicure' },
  { match: 'massage', label: 'Massage' },
  { match: 'facials', label: 'Facials' },
  { match: 'eyelash extensions', label: 'Eyelash Extensions' },
  { match: 'women waxing', label: 'Waxing — Women Face' },
  { match: 'body waxing', label: 'Waxing — Body' },
  { match: 'men services', label: 'Men Services' },
];

export type FlyerPriceGroup = {
  heading: string;
  items: { id: string; name: string; priceCents: number }[];
  img: string;
  alt: string;
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

/**
 * One banner photo per price group. These are the same shots the homepage
 * service cards use (already checked against what they show), keyed by the
 * group's display label. Anything unrecognised gets the products shot.
 */
const GROUP_IMAGES: Record<string, { img: string; alt: string }> = {
  'Special Package': {
    img: unsplash('photo-1522337660859-02fbefca4702'),
    alt: 'Pink gel nails finish',
  },
  Nails: {
    img: unsplash('photo-1604654894610-df63bc536371'),
    alt: 'Pink gel manicure close-up',
  },
  'Gel Application': {
    img: unsplash('photo-1610992015732-2449b76344bc'),
    alt: 'Gel polish colour selection',
  },
  Pedicure: {
    img: unsplash('photo-1519415510236-718bdfcd89c8'),
    alt: 'Feet soaking in a pedicure foot bath with orchids',
  },
  Massage: {
    img: unsplash('photo-1519823551278-64ac92734fb1'),
    alt: 'Full body massage for tension release',
  },
  Facials: {
    img: unsplash('photo-1570172619644-dfd03ed5d881'),
    alt: 'Hydrating facial treatment',
  },
  'Eyelash Extensions': {
    img: unsplash('photo-1589710751893-f9a6770ad71b'),
    alt: 'Eyelash extensions being applied with tweezers',
  },
  'Waxing — Women Face': {
    img: unsplash('photo-1512496015851-a90fb38ba796'),
    alt: 'Professional waxing and skincare products',
  },
  'Waxing — Body': {
    img: unsplash('photo-1512496015851-a90fb38ba796'),
    alt: 'Professional waxing and skincare products',
  },
  'Men Services': {
    img: unsplash('photo-1585747860715-2ba37e788b70'),
    alt: 'Men grooming barbershop service',
  },
};

const FALLBACK_IMAGE = {
  img: unsplash('photo-1596462502278-27bfdc403348'),
  alt: 'Professional beauty products and brushes',
};

/** Group services under the flyer's headings, in flyer order. */
export function groupForFlyer(services: Service[]): FlyerPriceGroup[] {
  const buckets = new Map<string, FlyerPriceGroup>();
  const order: string[] = [];

  for (const service of services) {
    const key = (service.description ?? '').trim().toLowerCase();
    const found = HEADINGS.find((entry) => entry.match === key);
    const label = found?.label ?? '';
    if (!buckets.has(label)) {
      const image = GROUP_IMAGES[label] ?? FALLBACK_IMAGE;
      buckets.set(label, { heading: label || 'More treatments', items: [], ...image });
      order.push(label);
    }
    buckets.get(label)!.items.push({
      id: service.id,
      name: service.name,
      priceCents: service.price_cents,
    });
  }

  const rank = (label: string) => {
    const index = HEADINGS.findIndex((entry) => entry.label === label);
    return index === -1 ? HEADINGS.length : index;
  };
  return order
    .map((label) => buckets.get(label)!)
    .sort((a, b) => rank(a.heading) - rank(b.heading));
}

/** The R500 signature special, for the homepage popup. */
export function findSpecialPackageId(services: Service[]): string | null {
  const hit = services.find((service) => service.price_cents === 50000);
  return hit?.id ?? null;
}

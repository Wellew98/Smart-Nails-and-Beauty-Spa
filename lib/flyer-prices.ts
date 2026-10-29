import type { Service } from './types';

/**
 * The flyer's own category headings, in flyer order.
 *
 * The database stores the category in `services.description` (migrations
 * 0006, 0010); these labels are the display form of those values. Anything
 * with no recognised category falls into an unheaded group at the top so the
 * page never hides a service.
 */
const HEADINGS: { match: string; label: string }[] = [
  // The 2026-10-30 flyer (migration 0013), in the order the flyer sets them:
  // left column top to bottom, then right column top to bottom. This array's
  // order IS the /prices page order, so keep it in step with the artwork.
  { match: 'special package', label: 'Special Package' },
  { match: 'nails', label: 'Nails' },
  { match: 'art & repair', label: 'Art & Repair' },
  { match: 'gel', label: 'Gel' },
  { match: 'eyelashes extensions', label: 'Eyelash Extensions' },
  { match: 'manicure', label: 'Manicure & Pedicure' },
  { match: 'add on', label: 'Add On' },
  { match: 'massage', label: 'Massage' },
  { match: 'waxing', label: 'Waxing' },
  // Retired with the October 2026 flyers (migrations 0006, 0010, 0013); kept
  // so any deactivated rows still group instead of vanishing if reactivated.
  { match: 'makeup', label: 'Makeup' },
  { match: 'body treatments', label: 'Body Treatments' },
  { match: 'pedicure', label: 'Pedicure' },
  { match: 'facials', label: 'Facials' },
  { match: 'lashes', label: 'Lashes' },
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
export const GROUP_IMAGES: Record<string, { img: string; alt: string }> = {
  'Special Package': {
    img: unsplash('photo-1540555700478-4be289fbecef'),
    alt: 'Spa towels and flowers beside treatment oil',
  },
  Nails: {
    img: unsplash('photo-1604654894610-df63bc536371'),
    alt: 'Pink gel manicure close-up',
  },
  'Art & Repair': {
    img: unsplash('photo-1519014816548-bf5fe059798b'),
    alt: 'Fresh red manicure close-up',
  },
  Gel: {
    img: unsplash('photo-1610992015732-2449b76344bc'),
    alt: 'Gel polish colour selection',
  },
  'Eyelash Extensions': {
    img: unsplash('photo-1589710751893-f9a6770ad71b'),
    alt: 'Eyelash extensions being applied with tweezers',
  },
  'Manicure & Pedicure': {
    img: unsplash('photo-1519415510236-718bdfcd89c8'),
    alt: 'Feet soaking in a pedicure foot bath with orchids',
  },
  'Add On': {
    img: unsplash('photo-1600334129128-685c5582fd35'),
    alt: 'Hot stone massage on a spa table',
  },
  Massage: {
    img: unsplash('photo-1519823551278-64ac92734fb1'),
    alt: 'Full body massage for tension release',
  },
  Waxing: {
    img: unsplash('photo-1512496015851-a90fb38ba796'),
    alt: 'Professional waxing and skincare products',
  },
  // Retired labels, kept so reactivated rows still get a picture.
  'Gel Application': {
    img: unsplash('photo-1610992015732-2449b76344bc'),
    alt: 'Gel polish colour selection',
  },
  Makeup: {
    img: unsplash('photo-1487412947147-5cebf100ffc2'),
    alt: 'Makeup beauty close-up',
  },
  'Body Treatments': {
    img: unsplash('photo-1544161515-4ab6ce6db874'),
    alt: 'Warm oil spa body treatment ritual',
  },
  Pedicure: {
    img: unsplash('photo-1519415510236-718bdfcd89c8'),
    alt: 'Feet soaking in a pedicure foot bath with orchids',
  },
  Facials: {
    img: unsplash('photo-1570172619644-dfd03ed5d881'),
    alt: 'Hydrating facial treatment',
  },
  Lashes: {
    img: unsplash('photo-1589710751893-f9a6770ad71b'),
    alt: 'Eyelash extensions being applied with tweezers',
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

/** The display heading for a `services.description` value, '' when unknown. */
export function headingLabelFor(description: string | null): string {
  const key = (description ?? '').trim().toLowerCase();
  return HEADINGS.find((entry) => entry.match === key)?.label ?? '';
}

/** Group services under the flyer's headings, in flyer order. */
export function groupForFlyer(services: Service[]): FlyerPriceGroup[] {
  const buckets = new Map<string, FlyerPriceGroup>();
  const order: string[] = [];

  for (const service of services) {
    const label = headingLabelFor(service.description);
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

/** The signature special, for the homepage popup. Null when the current flyer has none. */
export function findSpecialPackageId(services: Service[]): string | null {
  const hit = services.find(
    (service) =>
      (service.description ?? '').trim().toLowerCase() === 'special package',
  );
  return hit?.id ?? null;
}

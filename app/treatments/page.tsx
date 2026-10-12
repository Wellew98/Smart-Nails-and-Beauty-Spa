import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { formatZar } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Treatments in Glenanda',
  description:
    'Every treatment at Smart Nails and Beauty Spa, Glenanda, Johannesburg South. ' +
    'Nails, pedicures, facials, massage, lashes, waxing and more. ' +
    'Book online in under a minute.',
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=400&q=70&auto=format&fit=crop`;

/**
 * Hub behind the 8 category pages: a menu index first (name, dot leaders,
 * price — the thing she came for), a small photo strip second. Ranges are
 * computed from the services rows, so the board can never drift from the
 * booking page. Owner photos replace the Unsplash strip when they land.
 */
const HUB_IMAGES: Record<string, { img: string; alt: string }> = {
  nails: {
    img: unsplash('photo-1519014816548-bf5fe059798b'),
    alt: 'Fresh red manicure close-up',
  },
  pedicure: {
    img: unsplash('photo-1540555700478-4be289fbecef'),
    alt: 'Spa towels and flowers beside treatment oil',
  },
  massage: {
    img: unsplash('photo-1600334129128-685c5582fd35'),
    alt: 'Hot stone massage on a spa table',
  },
  facials: {
    img: unsplash('photo-1616394584738-fc6e612e71b9'),
    alt: 'Relaxing facial treatment in progress',
  },
  lashes: {
    img: unsplash('photo-1512290923902-8a9f81dc236c'),
    alt: 'Client reclining for a lash treatment',
  },
  waxing: {
    img: unsplash('photo-1560066984-138dadb4c035'),
    alt: 'Inside a professional beauty salon',
  },
  makeup: {
    img: unsplash('photo-1522335789203-aabd1fc54bc9'),
    alt: 'Eye makeup detail with lashes and shadow',
  },
  'body-treatments': {
    img: unsplash('photo-1596178060671-7a80dc8059ea'),
    alt: 'Neck and shoulder massage close-up',
  },
};

export default async function TreatmentsPage() {
  const business = await getBusiness();
  if (!business) notFound();
  const services = await getActiveServices(business.id);

  const rangeFor = (key: string): string | null => {
    const prices = services
      .filter((service) => (service.description ?? '').trim().toLowerCase() === key)
      .map((service) => service.price_cents);
    if (prices.length === 0) return null;
    return Math.min(...prices) === Math.max(...prices)
      ? formatZar(prices[0])
      : `${formatZar(Math.min(...prices))} to ${formatZar(Math.max(...prices))}`;
  };

  return (
    <section className="section" id="treatments" data-hero>
      <div className="wrap">
        <div className="board">
          <p className="eyebrow" data-hero-item>
            Smart Nails and Beauty Spa · Glenanda
          </p>
          <h2 data-split>Treatments</h2>
          <p className="sub" data-hero-item>
            Eight things we do, with honest prices. Pick one to read more, or
            skip straight to booking. No account needed.
          </p>
        </div>
        <ul className="menu-index" data-reveal>
          {CATEGORY_CONTENT.map((content) => (
            <li key={content.slug}>
              <Link href={`/treatments/${content.slug}`}>
                <span className="m-name">{content.label}</span>
                <span className="m-dots" aria-hidden="true" />
                <span className="m-price">{rangeFor(content.key) ?? content.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="strip" data-reveal>
          {CATEGORY_CONTENT.map((content) => {
            const image = HUB_IMAGES[content.slug];
            if (!image) return null;
            return (
              <Link
                key={content.slug}
                href={`/treatments/${content.slug}`}
                tabIndex={-1}
                aria-hidden="true"
              >
                {/* Plain img: remote Unsplash files, outside the next/image
                    allowlist by design (no new hosts in config). Decorative:
                    the index above already links every category. */}
                <img src={image.img} alt="" loading="lazy" />
                <span>{content.label}</span>
              </Link>
            );
          })}
        </div>
        <p>
          <Link className="btn btn-dark" href="/book">
            Book online
          </Link>
        </p>
        <p className="fine">
          <Link href="/prices">Full price list</Link>
        </p>
      </div>
    </section>
  );
}

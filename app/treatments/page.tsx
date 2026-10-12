import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORY_CONTENT } from '@/lib/category-content';

export const metadata: Metadata = {
  title: 'Treatments in Glenanda',
  description:
    'Every treatment at Smart Nails and Beauty Spa, Glenanda, Johannesburg South. ' +
    'Nails, pedicures, facials, massage, lashes, waxing and more. ' +
    'Book online in under a minute.',
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

/**
 * Hub behind the 8 category pages: one card per category with its own photo,
 * tagline and link, so visitors (and crawlers) reach every indexed page in
 * one hop. Deliberately a different set from the homepage/prices shots
 * (GROUP_IMAGES in lib/flyer-prices.ts) — every ID below was checked live
 * before use. Owner photos replace all of these when they land.
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

export default function TreatmentsPage() {
  return (
    <section className="section" id="treatments" data-hero>
      <div className="wrap">
        <p className="eyebrow" data-hero-item>
          Smart Nails and Beauty Spa · Glenanda
        </p>
        <h2 data-split>Treatments</h2>
        <p className="sub" data-hero-item>
          Eight things we do, each with its own guide and honest prices. Tap a
          category to read more, or skip straight to booking. No account needed.
        </p>
        <div className="price-groups" data-reveal>
          {CATEGORY_CONTENT.map((content) => {
            const image = HUB_IMAGES[content.slug];
            return (
              <article key={content.slug} className="pgroup">
                <Link href={`/treatments/${content.slug}`}>
                  {image && (
                    // Plain img: these are remote Unsplash files, outside the
                    // next/image allowlist by design (no new hosts in config).
                    <img
                      className="pgroup-img"
                      src={image.img}
                      alt={image.alt}
                      loading="lazy"
                    />
                  )}
                  <h3>{content.label}</h3>
                  <p className="fine">{content.tagline}</p>
                  <p className="fine">
                    <span className="see-more" aria-hidden="true">
                      See treatments ›
                    </span>
                  </p>
                </Link>
              </article>
            );
          })}
        </div>
        <p>
          <Link className="btn btn-dark" href="/book">
            Book online
          </Link>
        </p>
      </div>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { canonical } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Treatments in Glenanda',
  description:
    'Every treatment at Smart Nails and Beauty Spa, Glenanda, Johannesburg South. ' +
    'Acrylics, gel, manicures, pedicures, massage, lash extensions, waxing and more. ' +
    'Book online in under a minute.',
  ...canonical('/treatments'),
};

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

/**
 * Hub behind the category pages: one card per category with its own photo,
 * tagline and link, so visitors (and crawlers) reach every indexed page in
 * one hop. Deliberately a different set from the homepage/prices shots
 * (GROUP_IMAGES in lib/flyer-prices.ts) — every ID below was checked live
 * before use. Owner photos replace all of these when they land.
 *
 * The card count follows CATEGORY_CONTENT, which follows the owner's current
 * price list. Do not hardcode the number in the copy below.
 */
const HUB_IMAGES: Record<string, { img: string; alt: string }> = {
  'special-package': {
    img: unsplash('photo-1540555700478-4be289fbecef'),
    alt: 'Spa towels and flowers beside treatment oil',
  },
  nails: {
    img: unsplash('photo-1519014816548-bf5fe059798b'),
    alt: 'Fresh red manicure close-up',
  },
  'art-and-repair': {
    img: unsplash('photo-1610992015732-2449b76344bc'),
    alt: 'Gel polish colour selection',
  },
  gel: {
    img: unsplash('photo-1619607146034-5a05296c8f9a'),
    alt: 'Wall of nail polish bottles on gold shelves in a salon',
  },
  'eyelash-extensions': {
    img: unsplash('photo-1512290923902-8a9f81dc236c'),
    alt: 'Client reclining for a lash treatment',
  },
  manicure: {
    img: unsplash('photo-1540555700478-4be289fbecef'),
    alt: 'Spa towels and flowers beside treatment oil',
  },
  'add-ons': {
    img: unsplash('photo-1600334129128-685c5582fd35'),
    alt: 'Hot stone massage on a spa table',
  },
  massage: {
    img: unsplash('photo-1596178060671-7a80dc8059ea'),
    alt: 'Neck and shoulder massage close-up',
  },
  waxing: {
    img: unsplash('photo-1560066984-138dadb4c035'),
    alt: 'Inside a professional beauty salon',
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
          Every heading on the price list, each with its own guide and honest
          prices. Tap a category to read more, or skip straight to booking. No
          account needed.
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

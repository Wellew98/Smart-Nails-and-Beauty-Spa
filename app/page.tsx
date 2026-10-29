import type { Metadata } from 'next';
import Link from 'next/link';
import { PromoPopup } from '@/components/promo-popup';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { findSpecialPackageId } from '@/lib/flyer-prices';
import { REVIEW_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Smart Nails and Beauty Spa | Beauty Begins Here, Glenanda, Johannesburg South',
  description:
    'Smart Nails and Beauty Spa, 75 Amanda Avenue, Glenanda, Johannesburg South. Acrylics, gel, manicures, pedicures, lash extensions, massage and waxing. Book online in under a minute. Mon to Sat 8am to 8pm, Sun 9am to 4pm.',
};

/**
 * The home page grid. Each card deep-links /book with its category, and the
 * category string must match `services.description` exactly or the booking
 * page silently drops the filter and shows everything.
 *
 * `from` is a hand-maintained floor price for the category. It follows the
 * owner's price list (migration 0013, received 2026-10-30). Every time a flyer
 * changes, these eight strings need checking against the cheapest line in the
 * matching heading, or a card ends up advertising a price nobody can book.
 */
const SERVICE_CARDS = [
  {
    name: 'Nails',
    line: 'Acrylic, tips, French, ombre',
    from: 'from R110',
    category: 'Nails',
    img: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80&auto=format&fit=crop',
    alt: 'Pink gel manicure close-up',
  },
  {
    name: 'Gel',
    line: 'Overlay on hands or feet',
    from: 'from R230',
    category: 'Gel',
    img: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=800&q=80&auto=format&fit=crop',
    alt: 'Gel polish colour selection',
  },
  {
    name: 'Art & Repair',
    line: 'Designs, single repairs, soak off',
    from: 'from R40',
    category: 'Art & Repair',
    img: 'https://images.unsplash.com/photo-1619607146034-5a05296c8f9a?w=800&q=80&auto=format&fit=crop',
    alt: 'Wall of nail polish bottles on gold shelves in a salon',
  },
  {
    name: 'Manicure & Pedicure',
    line: 'Express, full, gel finish',
    from: 'from R230',
    category: 'Manicure',
    img: 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800&q=80&auto=format&fit=crop',
    alt: 'Feet soaking in a pedicure foot bath with orchids',
  },
  {
    name: 'Lash Extensions',
    line: 'Classic sets and weekly fills',
    from: 'from R110',
    category: 'Eyelash Extensions',
    img: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?w=800&q=80&auto=format&fit=crop',
    alt: 'Eyelash extensions being applied with tweezers',
  },
  {
    name: 'Massage',
    line: 'Swedish 30 or 60 minutes',
    from: 'from R180',
    category: 'Massage',
    img: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=800&q=80&auto=format&fit=crop',
    alt: 'Full body massage for tension release',
  },
  {
    name: 'Waxing',
    line: 'Brows, face, arms, legs, bikini',
    from: 'from R80',
    category: 'Waxing',
    img: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&q=80&auto=format&fit=crop',
    alt: 'Professional waxing and skincare products',
  },
  {
    name: 'Special Package',
    line: 'Three treatments, one booking',
    from: 'from R80',
    category: 'Special Package',
    img: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80&auto=format&fit=crop',
    alt: 'Spa towels and flowers beside treatment oil',
  },
] as const;

/**
 * The signature-offer popup is OFF until the owner confirms the package
 * prices. The 2026-10-30 flyer prints the two packages at R80 and R90, which
 * is a fraction of the sum of their parts, so advertising that number from
 * the home page before she has seen it is a risk not worth taking. The
 * packages are still listed and bookable under /prices and /book.
 *
 * Flip this to true once she confirms, and update the copy in
 * components/promo-popup.tsx at the same time (it still names the old R500
 * package and its old composition).
 */
const SHOW_PROMO_POPUP = false;

const GALLERY = [
  {
    img: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80&auto=format&fit=crop',
    alt: 'Warm oil spa massage ritual',
    caption: 'Warm oils and massage',
  },
  {
    img: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&q=80&auto=format&fit=crop',
    alt: 'Beautiful Black woman natural glow',
    caption: 'Glow',
  },
  {
    img: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=800&q=80&auto=format&fit=crop',
    alt: 'Pink gel nails manicure finish',
    caption: 'Pink gel finish',
  },
  {
    img: 'https://images.unsplash.com/photo-1619607146034-5a05296c8f9a?w=800&q=80&auto=format&fit=crop',
    alt: 'Wall of nail polish bottles on gold shelves in a salon',
    caption: 'The polish range',
  },
  {
    img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80&auto=format&fit=crop',
    alt: 'Professional beauty products and brushes',
    caption: 'Pro products and tools',
  },
  {
    img: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&q=80&auto=format&fit=crop',
    alt: 'Makeup beauty close-up',
    caption: 'The finished look',
  },
] as const;

/**
 * Flyer homepage, exactly like the supplied index.html except the price
 * list lives on its own page: the "Transparent pricing / Full price
 * list" section is replaced here by a short pointer to /prices.
 *
 * Booking is online-only by owner decision, so every booking button points
 * at /book (with a preselected service where one fits) and never WhatsApp.
 */
export default async function HomePage() {
  const business = (await getBusiness())!;
  const services = await getActiveServices(business.id);
  const specialId = findSpecialPackageId(services);

  return (
    <>
      {/* HERO */}
      <section className="hero" data-hero aria-labelledby="hero-heading">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="sun" data-hero-item>
              <img
                className="hero-logo"
                src="/logo.webp"
                alt="Smart Nails and Beauty Spa logo"
                width="220"
                height="220"
              />
            </div>
            <p className="fly-beauty" data-hero-item id="hero-heading">
              BEAUTY
            </p>
            <p className="fly-script" data-hero-item aria-label="begins here">
              begins here<span className="heart">♥</span>
            </p>
            <p className="fly-rules" data-hero-item>
              <span>RELAX</span>
              <i>•</i>
              <span>REJUVENATE</span>
              <i>•</i>
              <span>GLOW</span>
            </p>
            <p className="lede" data-hero-item>
              <strong>BEAUTY. CONFIDENCE. YOU.</strong>
            </p>
              <ul className="trust" data-hero-item>
                <li>✓ Appointments + walk-ins</li>
                <li>✓ Everyone welcome</li>
              </ul>
          </div>
          <div className="hero-card" data-hero-item>
            <Link
              className="hero-photo"
              href="/book"
              aria-label="Book your appointment today online"
              data-hero-media
            >
              <svg
                className="hero-curve"
                viewBox="0 0 120 1020"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M0 0 H56 C10 240 110 480 60 720 C36 850 28 940 12 1020 H0 Z" fill="#FDE7EF" />
                <path
                  d="M56 -10 C10 240 110 480 60 720 C36 850 28 940 12 1030"
                  fill="none"
                  stroke="#F06292"
                  strokeWidth="16"
                />
                <path
                  d="M64 -10 C18 240 118 480 68 720 C44 850 36 940 20 1030"
                  fill="none"
                  stroke="#141114"
                  strokeWidth="7"
                />
              </svg>
              <img
                src="/hero-hands.webp"
                alt="Pink almond manicure with orchid, candle and spa stones"
              />
              <span className="badge-cover" aria-hidden="true" data-hero-badge>
                <span className="b-heart">♥</span>
                <span className="b-top">BOOK YOUR</span>
                <span className="b-mid">APPOINTMENT</span>
                <span className="b-bot">Today!</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {SHOW_PROMO_POPUP && specialId ? <PromoPopup serviceId={specialId} /> : null}

      {/* MARQUEE — the menu in one breath, pacing hero into services.
          Two identical halves, each at least a viewport wide with items
          spaced evenly, so the bar reads full on any screen and the -50%
          loop stays seamless. */}
      <div className="marquee" aria-hidden="true">
        <p className="marquee-track">
          {[0, 1].map((half) => (
            <span className="marquee-half" key={half}>
              {['Nails', 'Gel', 'Acrylics', 'Manicure', 'Pedicure', 'Lashes', 'Massage', 'Waxing'].map(
                (item) => (
                  <span key={item}>{item}</span>
                ),
              )}
            </span>
          ))}
        </p>
      </div>

      {/* SERVICES GRID */}
      <section className="section" id="services">
        <div className="wrap">
          <p className="eyebrow" data-reveal>
            What we do
          </p>
          <h2 data-split>Services</h2>
          <div className="grid8">
            {SERVICE_CARDS.map((card, index) => (
              <Link
                className="svc"
                key={card.name}
                href={`/book?category=${encodeURIComponent(card.category)}`}
                data-reveal
                data-reveal-delay={(index % 4) * 0.07}
              >                <img src={card.img} alt={card.alt} loading="lazy" />
                <h3>{card.name}</h3>
                <p>{card.line}</p>
                <span>{card.from} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PRICES POINTER — the full list lives on its own page */}
      <section className="section prices" id="prices-teaser">
        <div className="wrap" data-reveal>
          <p className="eyebrow">Transparent pricing</p>
          <h2 data-split>Full price list</h2>
          <div className="offer-btns">
            <Link className="btn btn-pink" href="/book">
              Book online
            </Link>
            <Link className="btn btn-dark" href="/prices">
              View all prices
            </Link>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section className="section" id="gallery">
        <div className="wrap">
          <p className="eyebrow" data-reveal>
            Inspiration
          </p>
          <h2 data-split>A first look</h2>
          <div className="gal">
            {GALLERY.map((shot, index) => (
              <figure key={shot.img} data-reveal data-reveal-delay={(index % 3) * 0.08}>
                <img src={shot.img} alt={shot.alt} loading="lazy" />
                <figcaption>{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS — honest version: the listing is new and has no reviews yet,
          so there is nothing to quote and no rating to show. What the section
          can truthfully do is ask. When the owner's review screenshots land in
          lib/reviews.ts, this becomes the screenshot stack with REVIEW_URL as
          its "read them all" target. */}
      <section className="section tint" id="reviews">
        <div className="wrap narrow" data-reveal>
          <p className="eyebrow">Reviews</p>
          <h2 data-split>Been to Smart Nails?</h2>
          <p className="sub">
            We are new on Google, and every review helps a Glenanda neighbour book with
            confidence. It takes about a minute.
          </p>
          <div className="offer-btns">
            <a className="btn btn-pink" href={REVIEW_URL} target="_blank" rel="noopener">
              Leave a Google review
            </a>
            <Link className="btn btn-dark" href="/book">
              Book your next visit
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="wrap narrow" data-reveal>
          <p className="eyebrow">Good to know</p>
          <h2 data-split>FAQs</h2>
          <details open>
            <summary>Do I need an appointment?</summary>
            <p>
              Appointments may be required, but walk-ins are welcome when space allows.{' '}
              <Link href="/book">Book online</Link> and the time is yours.
            </p>
          </details>
          <details>
            <summary>Where are you?</summary>
            <p>75 Amanda Avenue, Glenanda, Johannesburg South. See map below.</p>
          </details>
          <details>
            <summary>What are your hours?</summary>
            <p>Monday to Saturday 8am to 8pm, Sunday 9am to 4pm.</p>
          </details>
          <details>
            <summary>Do you do men&apos;s services?</summary>
            <p>Yes, our Men&apos;s Facial is R450. Every treatment on the menu is open to everyone.</p>
          </details>
          <details>
            <summary>How do I book?</summary>
            <p>
              Open <Link href="/prices">the price list</Link>, tap the treatment you want and
              confirm your time online. Just that.
            </p>
          </details>
        </div>
      </section>

      {/* VISIT */}
      <section className="section tint" id="visit">
        <div className="wrap visit-grid" data-reveal>
          <div>
            <p className="eyebrow">Visit us</p>
            <h2 data-split>75 Amanda Avenue, Glenanda</h2>
            <p>Johannesburg South. Mon to Sat, 8 to 8. Sun, 9 to 4.</p>
            <div className="visit-btns">
              <Link className="btn btn-pink" href="/book">
                Book online
              </Link>
              <a className="btn btn-dark" href="tel:+27810444429">
                Call 081 044 4429
              </a>
              <a
                className="btn btn-ghost"
                href="https://www.google.com/maps/search/?api=1&query=75+Amanda+Avenue+Glenanda+Johannesburg+South"
                target="_blank"
                rel="noopener"
              >
                Directions
              </a>
            </div>
          </div>
          <iframe
            title="Map, Smart Nails 75 Amanda Ave Glenanda"
            src="https://www.google.com/maps?q=75%20Amanda%20Avenue%20Glenanda%20Johannesburg%20South&output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <Link className="float" href="/book" aria-label="Book online">
        Book
      </Link>
    </>
  );
}

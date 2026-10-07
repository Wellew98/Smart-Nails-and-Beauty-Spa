import type { Metadata } from 'next';
import Link from 'next/link';
import { PromoPopup } from '@/components/promo-popup';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { findSpecialPackageId } from '@/lib/flyer-prices';
import { REVIEW_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Smart Nails and Beauty Spa | Beauty Begins Here – Glenanda, Johannesburg South',
  description:
    'Smart Nails and Beauty Spa, 75 Amanda Avenue, Glenanda, Johannesburg South. Nails, Gel, Pedicure, Massage, Facials, Waxing, Lashes and Men services. Special Package R500. Book online in under a minute. Mon–Sat 8am–8pm, Sun 9am–4pm.',
};

const SERVICE_CARDS = [
  {
    name: 'Nails',
    line: 'Acrylic, tips, sculpture',
    from: 'from R100',
    category: 'Nails',
    img: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80&auto=format&fit=crop',
    alt: 'Pink gel manicure close-up',
  },
  {
    name: 'Gel',
    line: 'Hands, feet, Bio Sculpture',
    from: 'from R200',
    category: 'Gel',
    img: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=800&q=80&auto=format&fit=crop',
    alt: 'Gel polish colour selection',
  },
  {
    name: 'Pedicure',
    line: 'Gel, normal, paraffin',
    from: 'from R100',
    category: 'Pedicure',
    img: 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800&q=80&auto=format&fit=crop',
    alt: 'Feet soaking in a pedicure foot bath with orchids',
  },
  {
    name: 'Massage',
    line: 'Swedish, sport, hot stone',
    from: 'from R200',
    category: 'Massage',
    img: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=800&q=80&auto=format&fit=crop',
    alt: 'Full body massage for tension release',
  },
  {
    name: 'Facials',
    line: 'Hydrating, deep cleanse',
    from: 'from R300',
    category: 'Facials',
    img: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80&auto=format&fit=crop',
    alt: 'Hydrating facial treatment',
  },
  {
    name: 'Waxing',
    line: 'Face, body, R700 offer',
    from: 'from R100',
    category: 'Women waxing',
    img: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&q=80&auto=format&fit=crop',
    alt: 'Professional waxing and skincare products',
  },
  {
    name: 'Lashes',
    line: 'Classic, volume, fill',
    from: 'from R100',
    category: 'Eyelash extensions',
    img: 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?w=800&q=80&auto=format&fit=crop',
    alt: 'Eyelash extensions being applied with tweezers',
  },
  {
    name: 'Men',
    line: 'Mani, pedi, buff & shine',
    from: 'from R150',
    category: 'Men services',
    img: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80&auto=format&fit=crop',
    alt: 'Men grooming barbershop service',
  },
] as const;

const GALLERY = [
  {
    img: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80&auto=format&fit=crop',
    alt: 'Warm oil spa massage ritual',
    caption: 'Spa ritual — warm oils & massage',
  },
  {
    img: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&q=80&auto=format&fit=crop',
    alt: 'Beautiful Black woman natural glow',
    caption: 'Glow — beauty for our market',
  },
  {
    img: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=800&q=80&auto=format&fit=crop',
    alt: 'Pink gel nails manicure finish',
    caption: 'Nails — pink gel finish',
  },
  {
    img: 'https://images.unsplash.com/photo-1619607146034-5a05296c8f9a?w=800&q=80&auto=format&fit=crop',
    alt: 'Wall of nail polish bottles on gold shelves in a salon',
    caption: 'Colour wall — the polish range',
  },
  {
    img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80&auto=format&fit=crop',
    alt: 'Professional beauty products and brushes',
    caption: 'Artistry — pro products & tools',
  },
  {
    img: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&q=80&auto=format&fit=crop',
    alt: 'Makeup beauty close-up',
    caption: 'Confidence — finished look',
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
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="sun">
              <img
                className="hero-logo"
                src="/logo.webp"
                alt="Smart Nails and Beauty Spa logo"
                width="220"
                height="220"
              />
            </div>
            <p className="fly-beauty">BEAUTY</p>
            <p className="fly-script">
              begins here<span className="heart">♥</span>
            </p>
            <p className="fly-rules">
              <span>RELAX</span>
              <i>•</i>
              <span>REJUVENATE</span>
              <i>•</i>
              <span>GLOW</span>
            </p>
            <p className="lede">
              Nails, Pedicure, Massage, Facials, Waxing, Lashes &amp; more — real prices on the
              prices page, booking in seconds. <strong>BEAUTY. CONFIDENCE. YOU.</strong>
            </p>
            <div className="hero-btns">
              <Link className="btn btn-pink" href="/book">
                Book online
              </Link>
              <Link className="btn btn-ghost" href="/prices">
                View Prices
              </Link>
            </div>
            <ul className="trust">
              <li>✓ Appointments + walk-ins</li>
              <li>✓ Men services available</li>
            </ul>
          </div>
          <div className="hero-card">
            <Link
              className="hero-photo"
              href="/book"
              aria-label="Book your appointment today online"
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
              <span className="badge-cover" aria-hidden="true">
                <span className="b-heart">♥</span>
                <span className="b-top">BOOK YOUR</span>
                <span className="b-mid">APPOINTMENT</span>
                <span className="b-bot">Today!</span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <PromoPopup serviceId={specialId} />

      {/* SERVICES GRID */}
      <section className="section" id="services">
        <div className="wrap">
          <p className="eyebrow">What we do</p>
          <h2>Services</h2>
          <div className="grid8">
            {SERVICE_CARDS.map((card) => (
              <Link
                className="svc"
                key={card.name}
                href={`/book?category=${encodeURIComponent(card.category)}`}
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
        <div className="wrap">
          <p className="eyebrow">Transparent pricing</p>
          <h2>Full price list</h2>
          <p className="sub">
            Price-only, exactly as our flyer — on its own page. Tap any item to book it online.
          </p>
          <div className="offer-btns">
            <Link
              className="btn btn-pink"
              href={specialId ? `/book?service=${specialId}` : '/book'}
            >
              Book the R500 special
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
          <p className="eyebrow">Inspiration</p>
          <h2>Feel the experience</h2>
          <p className="sub">
            Nails, massage, facials and more — a taste of the range while our own studio
            photographs are on the way.
          </p>
          <div className="gal">
            {GALLERY.map((shot) => (
              <figure key={shot.img}>
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
        <div className="wrap narrow">
          <p className="eyebrow">Reviews</p>
          <h2>Been to Smart Nails?</h2>
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
        <div className="wrap narrow">
          <p className="eyebrow">Good to know</p>
          <h2>FAQs</h2>
          <details open>
            <summary>Do I need an appointment?</summary>
            <p>
              Appointments may be required, but walk-ins are welcome when space allows.{' '}
              <Link href="/book">Book online</Link> to secure your slot in seconds.
            </p>
          </details>
          <details>
            <summary>Where are you?</summary>
            <p>75 Amanda Avenue, Glenanda, Johannesburg South. See map below.</p>
          </details>
          <details>
            <summary>What are your hours?</summary>
            <p>Monday–Saturday 8am–8pm, Sunday 9am–4pm.</p>
          </details>
          <details>
            <summary>Do you do men&apos;s services?</summary>
            <p>Yes — Full Pedicure R250, Full Manicure R250, Buff &amp; Shine R150.</p>
          </details>
          <details>
            <summary>How do I book the R500 Special?</summary>
            <p>
              Open <Link href="/prices">the price list</Link>, tap the R500 Special Package and
              confirm your time online. Just that.
            </p>
          </details>
        </div>
      </section>

      {/* VISIT */}
      <section className="section tint" id="visit">
        <div className="wrap visit-grid">
          <div>
            <p className="eyebrow">Visit us</p>
            <h2>75 Amanda Avenue, Glenanda</h2>
            <p>Johannesburg South • Mon–Sat 8–8 • Sun 9–4</p>
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
            title="Map — Smart Nails 75 Amanda Ave Glenanda"
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

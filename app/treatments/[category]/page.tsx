import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { GROUP_IMAGES } from '@/lib/flyer-prices';
import { formatZar } from '@/lib/money';
import { slugEntries, slugify, SERVICE_AREAS } from '@/lib/seo';
import type { Service } from '@/lib/types';

export async function generateStaticParams(): Promise<{ category: string }[]> {
  return CATEGORY_CONTENT.map((content) => ({ category: content.slug }));
}

function categoryServices(services: Service[], key: string): Service[] {
  return services.filter(
    (service) => (service.description ?? '').trim().toLowerCase() === key,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const content = CATEGORY_CONTENT.find((item) => item.slug === category);
  if (!content) return { title: 'Not found' };
  return {
    title: `${content.label} in ${SERVICE_AREAS[0]}`,
    description:
      `${content.label} at Smart Nails and Beauty Spa, ${SERVICE_AREAS.join(', ')}. ` +
      `${content.tagline}`,
  };
}

/**
 * Outcomes build (video system 3, second pass): 8 deep category pages instead
 * of 58 thin service pages. Every fact on the page comes from the services
 * row (names, prices, durations); the prose is hand-written per category and
 * says nothing the salon has not got on record. Service detail pages live one
 * level down for visitors, but are noindexed — categories are the indexed
 * surface.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const content = CATEGORY_CONTENT.find((item) => item.slug === category);
  if (!content) notFound();

  const business = await getBusiness();
  if (!business) notFound();
  const services = await getActiveServices(business.id);
  const mine = categoryServices(services, content.key);
  if (mine.length === 0) notFound();

  const entries = slugEntries(services);
  const slugFor = (id: string): string | null =>
    entries.find((entry) => entry.service.id === id)?.slug ?? null;

  const prices = mine.map((service) => service.price_cents);
  const durations = mine.map((service) => service.duration_minutes);
  const priceRange =
    Math.min(...prices) === Math.max(...prices)
      ? formatZar(prices[0])
      : `${formatZar(Math.min(...prices))} to ${formatZar(Math.max(...prices))}`;
  const durationRange =
    Math.min(...durations) === Math.max(...durations)
      ? `about ${durations[0]} minutes`
      : `about ${Math.min(...durations)} to ${Math.max(...durations)} minutes`;

  const priceFaq = {
    q: `How much does ${content.label.toLowerCase()} cost?`,
    a: `Treatments run ${priceRange}, and the booking page confirms the exact price before you commit. You pay in studio, never online.`,
  };
  const faqs = [priceFaq, ...content.faqs];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  const image = GROUP_IMAGES[content.label];
  const others = CATEGORY_CONTENT.filter((item) => item.slug !== content.slug);

  return (
    <section className="section" id={`treatments-${content.slug}`} data-hero>
      <div className="wrap">
        <p className="eyebrow" data-hero-item>
          {content.label} · {SERVICE_AREAS.join(' · ')}
        </p>
        <h2 data-split>
          {content.label} in {SERVICE_AREAS[0]}
        </h2>
        <p className="sub" data-hero-item>
          {content.tagline} {priceRange} · {durationRange}
        </p>
        {image && (
          <img
            className="cat-img"
            src={image.img}
            alt={image.alt}
            loading="lazy"
          />
        )}

        {content.intro.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}

        <h3>What to expect</h3>
        <ul>
          {content.expect.map((item) => (
            <li key={item.slice(0, 24)}>{item}</li>
          ))}
        </ul>

        <h3>
          {content.label} treatments ({mine.length})
        </h3>
        <ul className="treat-list">
          {mine.map((service) => {
            const slug = slugFor(service.id) ?? slugify(service.name);
            return (
              <li key={service.id}>
                <Link href={`/treatments/${content.slug}/${slug}`}>
                  {service.name}{' '}
                  <span className="fine">
                    from {formatZar(service.price_cents)}, about {service.duration_minutes}{' '}
                    minutes
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p>
          <Link className="btn btn-dark" href="/book">
            Book online
          </Link>
        </p>

        <h3>Good to know</h3>
        <ul>
          {content.goodToKnow.map((item) => (
            <li key={item.slice(0, 24)}>{item}</li>
          ))}
        </ul>

        <h3>Questions, answered</h3>
        <dl>
          {faqs.map((faq) => (
            <div key={faq.q}>
              <dt>{faq.q}</dt>
              <dd>{faq.a}</dd>
            </div>
          ))}
        </dl>

        <h3>More treatments</h3>
        <ul>
          {others.map((item) => (
            <li key={item.slug}>
              <Link href={`/treatments/${item.slug}`}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <p className="fine">
          <Link href="/treatments">All treatments</Link> ·{' '}
          <Link href="/prices">Full price list</Link>
        </p>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </div>
    </section>
  );
}

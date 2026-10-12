import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { slugEntries, SERVICE_AREAS } from '@/lib/seo';
import { formatZar } from '@/lib/money';
import type { Service } from '@/lib/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

interface ServiceRoute {
  content: (typeof CATEGORY_CONTENT)[number];
  service: Service;
  slug: string;
}

async function serviceRoutes(): Promise<ServiceRoute[]> {
  const business = await getBusiness();
  if (!business) return [];
  const services = await getActiveServices(business.id);
  const entries = slugEntries(services);
  const routes: ServiceRoute[] = [];
  for (const content of CATEGORY_CONTENT) {
    const mine = services.filter(
      (service) => (service.description ?? '').trim().toLowerCase() === content.key,
    );
    const mineIds = new Set(mine.map((service) => service.id));
    for (const entry of entries) {
      if (mineIds.has(entry.service.id)) {
        routes.push({ content, service: entry.service, slug: entry.slug });
      }
    }
  }
  return routes;
}

export async function generateStaticParams(): Promise<
  { category: string; service: string }[]
> {
  return (await serviceRoutes()).map((route) => ({
    category: route.content.slug,
    service: route.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; service: string }>;
}): Promise<Metadata> {
  const { category, service } = await params;
  const route = (await serviceRoutes()).find(
    (item) => item.content.slug === category && item.slug === service,
  );
  if (!route) return { title: 'Not found' };
  return {
    title: `${route.service.name} in ${SERVICE_AREAS[0]}`,
    description:
      `${route.service.name} at Smart Nails and Beauty Spa, ${SERVICE_AREAS.join(', ')}. ` +
      `From ${formatZar(route.service.price_cents)}, about ${route.service.duration_minutes} minutes. ` +
      `Book online in under a minute.`,
    // Visitor pages, not the indexed surface: the 8 category pages rank,
    // these serve people arriving from them. Still followable so link equity
    // flows back up.
    robots: { index: false, follow: true },
  };
}

/**
 * Service detail, one level under its category. Kept deliberately thin and
 * noindexed: its job is answering "how much, how long, book" for a visitor
 * who arrived from the category page, not ranking on its own.
 */
export default async function TreatmentServicePage({
  params,
}: {
  params: Promise<{ category: string; service: string }>;
}) {
  const { category, service } = await params;
  const routes = await serviceRoutes();
  const route = routes.find(
    (item) => item.content.slug === category && item.slug === service,
  );
  if (!route) notFound();
  const { content, service: current } = route;
  const business = (await getBusiness())!;

  const faqs = [
    {
      q: `How long does ${current.name} take?`,
      a: `About ${current.duration_minutes} minutes. Turnaround time for the room is booked separately, behind your appointment, so it never comes out of yours.`,
    },
    {
      q: `How much does ${current.name} cost?`,
      a: `From ${formatZar(current.price_cents)}. The booking page confirms the final price before you commit, and you pay in studio.`,
    },
    {
      q: `How do I book ${current.name}?`,
      a: `Pick the treatment on the booking page, choose a therapist and a time, and it is confirmed instantly. No account needed.`,
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  const siblings = routes.filter(
    (item) => item.content.slug === category && item.slug !== service,
  );
  const others = routes
    .filter((item) => item.content.slug !== category)
    .slice(0, 8 - Math.min(siblings.length, 8));

  return (
    <section className="section" id="treatment" data-hero>
      <div className="wrap">
        <p className="eyebrow" data-hero-item>
          {content.label} · {SERVICE_AREAS.join(' · ')}
        </p>
        <h2 data-split>
          {current.name} in {SERVICE_AREAS[0]}
        </h2>
        <p className="sub" data-hero-item>
          From {formatZar(current.price_cents)} · about {current.duration_minutes} minutes ·{' '}
          {business.phone}
        </p>
        <p>
          <Link className="btn btn-dark" href={`/book?service=${current.id}`}>
            Book {current.name}
          </Link>
        </p>
        <p className="fine">
          <Link href={`/treatments/${content.slug}`}>
            More about {content.label.toLowerCase()}
          </Link>
        </p>

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
          {siblings.map((item) => (
            <li key={item.slug}>
              <Link href={`/treatments/${item.content.slug}/${item.slug}`}>
                {item.service.name}
              </Link>
            </li>
          ))}
          {others.map((item) => (
            <li key={`${item.content.slug}-${item.slug}`}>
              <Link href={`/treatments/${item.content.slug}/${item.slug}`}>
                {item.service.name}
              </Link>
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

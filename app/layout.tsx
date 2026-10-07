import type { Metadata } from 'next';
import { Cormorant_Garamond, Great_Vibes, Jost } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { LocalBusinessJsonLd } from '@/components/local-business-jsonld';
import { ChatWidget } from '@/components/ai/chat-widget';
import { limitsFrom } from '@/lib/ai/orchestrator';
import { providerConfigProblem } from '@/lib/ai/provider';
import { getActiveServices, getBusiness, getOpeningHours } from '@/lib/public-data';
import { SITE } from '@/lib/site';
import './globals.css';
import './flyer.css';

/* Flyer design fonts: Cormorant Garamond display, Great Vibes script
   ("begins here"), Jost body. Loaded here so every page, including
   /book and /admin, renders in the same type as the flyer. */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-great-vibes',
  display: 'swap',
});

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Marketing pages are prerendered, then refreshed every five minutes.
 *
 * Fully static would be fastest, but the treatment list, prices, opening hours
 * and the sample-menu banner all come from the database — and the owner edits
 * those in Admin > Setup. Without revalidation her changes would sit invisible
 * until someone redeployed, which is a confusing way for a price change to
 * behave. Five minutes keeps the pages effectively static while making edits
 * show up on their own.
 *
 * /book and /b/[token] set `dynamic = 'force-dynamic'` themselves: availability
 * must never be served from a cache.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const business = await getBusiness();
  const name = business?.name ?? 'Smart Nails and Beauty Spa';

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${name} | Beauty Begins Here – Glenanda, Johannesburg South`,
      template: `%s · ${name}`,
    },
    description:
      'Smart Nails and Beauty Spa, 75 Amanda Avenue, Glenanda, Johannesburg South. Nails, Gel, Pedicure, Massage, Facials, Waxing, Lashes and Men services. Special Package R500. Book online in under a minute. Mon–Sat 8am–8pm, Sun 9am–4pm.',
    openGraph: { title: name, description: SITE.heroSupport, type: 'website', locale: 'en_ZA' },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const business = await getBusiness();

  // The site is a shell around one business row. Without it there is nothing
  // to render, and a blank page is a clearer signal than half a layout.
  if (!business) {
    return (
      <html lang="en-ZA">
        <body className="p-10 font-sans">
          <h1 className="text-lg font-semibold">No business configured</h1>
          <p className="mt-2 text-sm">
            Apply <code>supabase/migrations</code> and <code>supabase/seed.sql</code>, then set{' '}
            <code>SUPABASE_DB_URL</code>.
          </p>
        </body>
      </html>
    );
  }

  const [services, hours] = await Promise.all([
    getActiveServices(business.id),
    getOpeningHours(business.id),
  ]);

  /**
   * The assistant is an enhancement; the booking system is the product.
   *
   * Decided here, on the server, so a deployment with no AI key ships no chat
   * button and no chat JavaScript rather than a button that apologises — and
   * nothing outside lib/ai, components/ai and the chat route ever reads an AI
   * environment variable. Removing GEMINI_API_KEY leaves this page with
   * nothing that could fail.
   */
  const assistantAvailable = providerConfigProblem() === null;

  return (
    <html
      lang="en-ZA"
      className={`${cormorant.variable} ${greatVibes.variable} ${jost.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-[#141114] focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader businessName={business.name} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter business={business} hours={hours} chatWidgetPresent={assistantAvailable} />
        {assistantAvailable && (
          <ChatWidget
            businessName={business.name}
            maxMessageLength={limitsFrom().maxMessageLength}
          />
        )}
        <LocalBusinessJsonLd
          business={business}
          services={services}
          hours={hours}
          siteUrl={SITE_URL}
        />
      </body>
    </html>
  );
}

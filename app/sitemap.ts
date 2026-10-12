import type { MetadataRoute } from 'next';
import { getBusiness } from '@/lib/public-data';
import { CATEGORY_CONTENT } from '@/lib/category-content';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Outcomes build (video system 3): submit /sitemap.xml in Search Console.
 * Only the 8 category pages are listed — the per-service detail pages are
 * noindexed visitor pages, so they stay out of the sitemap. Without a
 * database (fresh checkout, no env) this lists the shell only.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/prices`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/treatments`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/gallery`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const business = await getBusiness().catch(() => null);
  if (!business) return staticRoutes;

  for (const content of CATEGORY_CONTENT) {
    staticRoutes.push({
      url: `${SITE_URL}/treatments/${content.slug}`,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }
  return staticRoutes;
}

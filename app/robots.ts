import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * There was no robots.txt at all, so `/robots.txt` fell through to the 404
 * page. Crawlers treat that as "no rules" rather than "stay out", which is the
 * worst of both: no crawl guidance and no sitemap hint.
 *
 * The private areas are disallowed here as a courtesy, not as security. A
 * disallowed URL can still be indexed if something else links to it, and the
 * diary, the booking-token pages and the voucher-token pages all carry
 * `noindex` themselves. Never rely on robots.txt to hide anything.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/account', '/b/', '/v/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

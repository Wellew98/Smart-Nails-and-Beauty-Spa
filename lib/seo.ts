/**
 * Programmatic SEO helpers (outcomes build, video system 3).
 *
 * One static page per treatment at /treatments/[slug]. Slugs derive from the
 * service name so an owner editing names in Admin > Setup gets a readable URL;
 * the trade-off is that renaming a service moves its URL. Collisions resolve
 * to the first service by sort order, and are unlikely across 54 distinct
 * flyer names.
 */

import type { Metadata } from 'next';

/**
 * The address this site answers on, without a trailing slash.
 *
 * Vercel always serves a project on `<project>.vercel.app`; that cannot be
 * switched off. Once the custom domain was connected the same pages answered on
 * two hostnames, and because nothing ever named a preferred URL, Google indexed
 * both. `next.config.ts` now redirects the Vercel alias here, and every
 * indexable page names itself with a canonical tag, so the two mechanisms
 * reinforce each other if either one is ever removed.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.smartnailsandbeautyspa.co.za'
).replace(/\/+$/, '');

/** A self-referencing canonical for `path`, e.g. `canonical('/prices')`. */
export function canonical(path = '/'): Pick<Metadata, 'alternates'> {
  return { alternates: { canonical: path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}` } };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * One slug per service, first-wins on collisions (services arrive in sort
 * order, matching generateStaticParams). Shared by the sitemap, the category
 * pages and the service detail pages so a link and a URL can never disagree.
 */
export function slugEntries<T extends { name: string }>(services: T[]): { service: T; slug: string }[] {
  const seen = new Set<string>();
  const entries: { service: T; slug: string }[] = [];
  for (const service of services) {
    const slug = slugify(service.name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ service, slug });
  }
  return entries;
}

/** Areas served, in the GBP's own words. Single source for pSEO copy. */
export const SERVICE_AREAS = ['Glenanda', 'Johannesburg South'] as const;

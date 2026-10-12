/**
 * Programmatic SEO helpers (outcomes build, video system 3).
 *
 * One static page per treatment at /treatments/[slug]. Slugs derive from the
 * service name so an owner editing names in Admin > Setup gets a readable URL;
 * the trade-off is that renaming a service moves its URL. Collisions resolve
 * to the first service by sort order, and are unlikely across 54 distinct
 * flyer names.
 */

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

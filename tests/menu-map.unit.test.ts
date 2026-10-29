import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { GROUP_IMAGES, categoryLabelFor, headingLabelFor } from '@/lib/flyer-prices';

/**
 * The menu has three copies of the same fact: the `description` column in the
 * database, the `key` in CATEGORY_CONTENT (which builds the /treatments pages)
 * and the `match` list in flyer-prices (which builds the /prices groups).
 *
 * When one of them drifts, NOTHING CRASHES. The services simply stop appearing:
 * a category page renders `notFound()`, a price group falls back to "More
 * treatments", and the only symptom is a treatment missing from the site. That
 * is exactly what happened on 2026-10-30, when the flyer's heading
 * "EYELASHES EXTENSIONS" was written as "eyelash extensions" in code and six
 * lash treatments silently vanished from the build.
 *
 * This test reads the shipping migration and fails if any heading in it is not
 * covered by both lookups.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** The migration that seeds the current menu. Bump this when a new flyer lands. */
const MENU_MIGRATION = '0013_price_list.sql';

function descriptionsInMigration(): string[] {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MENU_MIGRATION), 'utf8');
  // insert ... values ('<uuid>', '<business>', '<name>', '<description>', dur, turn, price, sort)
  const pattern = /'[0-9a-f-]{36}'\s*,\s*'[0-9a-f-]{36}'\s*,\s*'(?:[^']|'')*'\s*,\s*'((?:[^']|'')*)'/gi;
  const found = new Set<string>();
  for (const match of sql.matchAll(pattern)) {
    found.add(match[1].replace(/''/g, "'"));
  }
  return [...found];
}

describe('menu headings', () => {
  const descriptions = descriptionsInMigration();

  it('finds the headings in the migration', () => {
    // Guards against the regex quietly matching nothing and the test passing
    // for the wrong reason.
    expect(descriptions.length).toBeGreaterThanOrEqual(5);
  });

  it('every heading has a category page', () => {
    const keys = new Set(CATEGORY_CONTENT.map((content) => content.key));
    const missing = descriptions.filter((description) => !keys.has(description.trim().toLowerCase()));
    expect(missing, `No CATEGORY_CONTENT entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every heading has a price-list label', () => {
    const missing = descriptions.filter(
      (description) => headingLabelFor(description) === '',
    );
    expect(missing, `No flyer-prices HEADINGS entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every category page has an image', () => {
    const missing = CATEGORY_CONTENT.filter(
      (content) => !GROUP_IMAGES[headingLabelFor(content.key)],
    ).map((content) => content.slug);
    expect(missing, `No GROUP_IMAGES entry for: ${missing.join(', ')}`).toEqual([]);
  });

  it('uses unique slugs and keys', () => {
    expect(new Set(CATEGORY_CONTENT.map((c) => c.slug)).size).toBe(CATEGORY_CONTENT.length);
    expect(new Set(CATEGORY_CONTENT.map((c) => c.key)).size).toBe(CATEGORY_CONTENT.length);
  });

  it('homepage cards deep-link a real booking tab', () => {
    // Read the source rather than importing the page: app/page.tsx is a server
    // component that fetches at render time, and this test must not need a DB.
    // A card whose `category` matches no tab still renders and still links to
    // /book, it just lands on the first tab, so only a test like this notices.
    const source = fs.readFileSync(path.join(process.cwd(), 'app', 'page.tsx'), 'utf8');
    const cardCategories = [...source.matchAll(/category:\s*'([^']*)'/g)].map((match) => match[1]);
    expect(cardCategories.length).toBeGreaterThanOrEqual(5);

    const tabLabels = new Set(descriptions.map((description) => categoryLabelFor(description)));
    const orphans = cardCategories.filter((category) => !tabLabels.has(category));
    expect(
      orphans,
      `Homepage cards link to a category no booking tab uses: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('booking tab labels are display-ready', () => {
    // The database keeps the flyer's wording; the tab strip must not.
    const labels = descriptions.map((description) => categoryLabelFor(description));
    expect(labels).not.toContain('Eyelashes Extensions');
    expect(labels).not.toContain('Manicure');
    expect(new Set(labels).size).toBe(labels.length);
  });
});

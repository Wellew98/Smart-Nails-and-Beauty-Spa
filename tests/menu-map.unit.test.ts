import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_CONTENT } from '@/lib/category-content';
import { GROUP_IMAGES, headingLabelFor } from '@/lib/flyer-prices';

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
});

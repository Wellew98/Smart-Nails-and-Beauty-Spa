import { beforeEach, describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { TOOL_NAMES } from '@/lib/ai/types';
import { getBusiness } from '@/lib/availability';
import { formatDuration, formatZar } from '@/lib/money';
import { getActiveServices, getActiveStaff, getOpeningHours } from '@/lib/public-data';
import { IDS, resetDatabase } from '../helpers/fixtures';

/**
 * The system prompt (`lib/ai/system-prompt.ts`).
 *
 * The rule the file exists to keep: nothing that can change goes in the prompt.
 * These tests check it against the ACTUAL ROWS in the database rather than
 * against a list written here, because a list written here is the second copy
 * the rule is about — it would go stale the first time the seed changed and
 * quietly stop testing anything.
 *
 * What the rule buys: the owner edits a price in Admin > Setup and the
 * assistant is right on the next message, with no deploy, and it cannot
 * contradict the page the customer is reading it on.
 */

beforeEach(resetDatabase);

const TODAY = '2026-08-12';

async function prompt(): Promise<string> {
  const business = await getBusiness(IDS.business);
  return buildSystemPrompt({ businessName: business!.name, today: TODAY });
}

describe('what the prompt must not contain', () => {
  it('names no treatment', async () => {
    const text = (await prompt()).toLowerCase();
    for (const service of await getActiveServices(IDS.business)) {
      expect(text).not.toContain(service.name.toLowerCase());
      // The distinguishing word too — 'Massage' out of 'Full Body Massage' is
      // just as much a claim about the menu as the whole name.
      for (const word of service.name.split(/[^a-z]+/i).filter((part) => part.length >= 5)) {
        expect(text).not.toContain(word.toLowerCase());
      }
    }
  });

  it('quotes no price', async () => {
    const text = await prompt();
    for (const service of await getActiveServices(IDS.business)) {
      expect(text).not.toContain(formatZar(service.price_cents));
      expect(text).not.toContain(String(service.price_cents));
    }
    // Nothing shaped like a rand amount at all, whatever the menu becomes.
    expect(text).not.toMatch(/\bR\s?\d/);
  });

  it('states no treatment length', async () => {
    const text = await prompt();
    for (const service of await getActiveServices(IDS.business)) {
      expect(text).not.toContain(formatDuration(service.duration_minutes));
    }
    expect(text).not.toMatch(/\b\d+\s*(min|mins|minutes|hr|hrs|hour|hours)\b/i);
  });

  it('names no therapist', async () => {
    const text = (await prompt()).toLowerCase();
    for (const member of await getActiveStaff(IDS.business)) {
      expect(text).not.toContain(member.name.toLowerCase());
    }
  });

  it('states no opening hour', async () => {
    const text = await prompt();
    for (const day of await getOpeningHours(IDS.business)) {
      expect(text).not.toContain(day.opens);
      expect(text).not.toContain(day.closes);
    }
    // Nothing shaped like a clock time either.
    expect(text).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it('gives no address', async () => {
    const business = await getBusiness(IDS.business);
    const text = (await prompt()).toLowerCase();

    expect(text).not.toContain(business!.address!.toLowerCase());
    for (const part of business!.address!.split(/[^a-z0-9]+/i).filter((token) => token.length >= 4)) {
      expect(text).not.toContain(part.toLowerCase());
    }
    // Which also rules out the IANA timezone id, since it carries the city.
    // The model has no business converting a time anyway — the tools return
    // them already in the studio's zone.
    expect(text).not.toContain(business!.timezone.toLowerCase());
  });

  it('gives no phone number', async () => {
    const business = await getBusiness(IDS.business);
    const text = await prompt();

    expect(text).not.toContain(business!.phone);
    expect(text).not.toContain('081 044 4429');
  });

  it('survives the menu changing under it', async () => {
    // The real proof: the prompt is the same string whatever is in the
    // database. If it were not, something in it came from a row.
    const before = await prompt();

    const { query } = await import('@/lib/db');
    await query("update services set name = 'Hot Stone Ritual', price_cents = 99900");
    await query("update staff set name = 'Ayanda'");

    expect(await prompt()).toBe(before);
  });
});

describe('what the prompt must contain', () => {
  it('names the business, from the businesses row', async () => {
    expect(await prompt()).toContain('Smart Nails and Beauty Spa');

    const { query } = await import('@/lib/db');
    await query("update businesses set name = 'Some Other Spa' where id = $1", [IDS.business]);
    expect(await prompt()).toContain('Some Other Spa');
  });

  it("carries today's date, so relative days can be worked out", async () => {
    expect(await prompt()).toContain(TODAY);
  });

  it('lists every tool', async () => {
    const text = await prompt();
    for (const name of TOOL_NAMES) {
      expect(text).toContain(name);
    }
  });

  it('tells the assistant to present sample data rather than deflect', async () => {
    const text = (await prompt()).toLowerCase();
    expect(text).toContain('sample data');
    expect(text).toMatch(/answer normally/);
    expect(text).toMatch(/never hide them|never present them as confirmed/);
  });

  it('tells the assistant to keep personal details out of the conversation', async () => {
    const text = (await prompt()).toLowerCase();
    expect(text).toMatch(/do not ask a guest to type their name/);
    expect(text).toMatch(/booking form/);
  });

  it('forbids stating anything a tool did not return', async () => {
    const text = (await prompt()).toLowerCase();
    expect(text).toMatch(/never state a price/);
    expect(text).toMatch(/no knowledge of this studio beyond what the tools return/);
  });
});

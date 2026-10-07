'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type PriceItem = { id: string; name: string; priceCents: number };
export type PriceGroup = { heading: string; items: PriceItem[]; img: string; alt: string };

function formatRand(priceCents: number): string {
  const rand = priceCents / 100;
  return `R${Number.isInteger(rand) ? rand : rand.toFixed(2)}`;
}

/**
 * Full flyer price list: price-only rows grouped under the flyer's own
 * headings, with the search box from the flyer. Every row books online
 * (owner decision): tapping an item opens /book with that treatment
 * preselected, never WhatsApp.
 */
export function PriceList({ groups }: { groups: PriceGroup[] }) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.name.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <>
      <input
        id="priceSearch"
        type="search"
        placeholder="Search — try gel, facial, wax…"
        aria-label="Search prices"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="price-groups">
        {visible.map((group) => (
          <article className="pgroup" key={group.heading} data-group>
            <img className="pgroup-img" src={group.img} alt={group.alt} loading="lazy" />
            <h3>{group.heading}</h3>
            <ul>
              {group.items.map((item) => {
                const isDeal = item.name.startsWith('Full Body Offer');
                return (
                  <li key={item.id} className={isDeal ? 'deal' : undefined}>
                    <Link href={`/book?service=${item.id}`}>
                      <span>{item.name}</span>
                      <strong>{formatRand(item.priceCents)}</strong>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="fine">No treatments match “{query}”. Try gel, facial or wax.</p>
      )}
    </>
  );
}

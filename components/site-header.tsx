'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SmartMark } from '@/components/smart-mark';
import { NAV } from '@/lib/site';

export function SiteHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * The homepage carries the mark itself, at full size, about sixty pixels
   * below this bar. Two of the same logo that close together is one too many,
   * so the header hands the job to the hero and shows nothing on the left.
   *
   * Everywhere ELSE the mark stays: it is the only branding on those pages and
   * the only way back to the homepage from them. On the homepage there is
   * nothing to link back to, so nothing is lost by dropping it there.
   *
   * The business name used to sit beside it in text. It has gone because the
   * mark already reads "SMART / NAILS AND BEAUTY SPA" — the name was printed
   * twice, side by side. Nothing about §8 is weakened: the NAP block in the
   * footer is on every page and is what search engines read.
   */
  const isHome = pathname === '/';

  return (
    <header className="sticky top-0 z-50 border-b border-gilt-200/60 bg-blush-50/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5">
        {!isHome && (
          <Link
            href="/"
            className="flex items-center text-aubergine-900"
            onClick={() => setOpen(false)}
          >
            {/* Titled, not decorative: with the name gone this is the link's
                only accessible name. */}
            <SmartMark
              variant="compact"
              title={businessName}
              className="h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10"
            />
          </Link>
        )}

        <nav aria-label="Main" className="ml-auto hidden items-center gap-7 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`text-sm transition-colors ${
                pathname === item.href
                  ? 'text-aubergine-900'
                  : 'text-mauve-500 hover:text-aubergine-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Book is always reachable, at every width. */}
        <Link
          href="/book"
          className="ml-auto rounded-full bg-lacquer-500 px-4 py-2 text-sm font-medium text-blush-50 transition-colors hover:bg-lacquer-600 sm:ml-0"
        >
          Book
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-mr-1 p-1.5 text-aubergine-900 sm:hidden"
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M3 7h16M3 15h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-gilt-200/60 sm:hidden">
          <ul className="mx-auto max-w-5xl px-5 py-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className="block border-b border-blush-200 py-3 text-[0.95rem] text-aubergine-900 last:border-0"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

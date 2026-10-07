'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Flyer header: topbar (hours, address, phone) plus sticky nav with the
 * logo mark, section links and the online-booking button.
 *
 * Booking is online-only by owner decision: every Book button points at
 * /book, never at WhatsApp. Prices live on their own page at /prices; the
 * rest are anchors on the homepage, exactly like the flyer single page.
 */
export function SiteHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="topbar">
        <span>Mon–Sat 8am–8pm • Sun 9am–4pm</span>
        <span className="dot">•</span>
        <span>75 Amanda Ave, Glenanda</span>
        <span className="dot">•</span>
        <a href="tel:+27810444429">081 044 4429</a>
      </div>

      <header className="nav" id="top">
        <Link className="brand" href="/" aria-label={`${businessName} home`}>
          <img src="/logo.webp" alt={`${businessName} logo`} width="48" height="48" />
          <span>
            <strong>SMART</strong>
            <small>NAILS AND BEAUTY SPA</small>
          </span>
        </Link>
        <nav className={`links${open ? ' open' : ''}`} id="navLinks" aria-label="Primary">
          <Link href="/#services" onClick={() => setOpen(false)}>
            Services
          </Link>
          <Link
            href="/prices"
            aria-current={pathname === '/prices' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            Prices
          </Link>
          <Link href="/#gallery" onClick={() => setOpen(false)}>
            Gallery
          </Link>
          <Link href="/#reviews" onClick={() => setOpen(false)}>
            Reviews
          </Link>
          <Link href="/#visit" onClick={() => setOpen(false)}>
            Visit
          </Link>
        </nav>
        <div className="nav-cta">
          <Link className="btn btn-dark btn-sm" href="/book">
            Book online
          </Link>
          <button
            className="burger"
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </header>
    </>
  );
}

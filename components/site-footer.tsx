import Link from 'next/link';
import { formatPhoneForDisplay } from '@/lib/phone';
import type { Business } from '@/lib/types';

/**
 * Flyer footer on the dark disc colour, with the NAP block kept verbatim
 * from the `businesses` row (name, address and phone must match the Google
 * Business Profile byte for byte).
 */
export function SiteFooter({
  business,
  hours,
  chatWidgetPresent = false,
}: {
  business: Business;
  hours: { day: number; opens: string; closes: string }[];
  /** Reserved so the floating buttons never cover the last footer row. */
  chatWidgetPresent?: boolean;
}) {
  const byDay = new Map(hours.map((entry) => [entry.day, entry]));
  const dayName = (day: number) =>
    (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const)[day];

  // Collapse consecutive days with identical hours into ranges, so six
  // identical weekdays read as one span: "Mon–Sat 08:00–20:00 • Sun 09:00–16:00".
  // Order is Monday-first; the grouping follows whatever the DB actually holds.
  const hoursLine = (() => {
    const days = [1, 2, 3, 4, 5, 6, 0];
    const spans: { from: number; to: number; label: string }[] = [];
    for (const day of days) {
      const entry = byDay.get(day);
      const label = entry ? `${entry.opens}–${entry.closes}` : 'Closed';
      const last = spans[spans.length - 1];
      if (last && last.label === label && day === last.to + 1) last.to = day;
      else spans.push({ from: day, to: day, label });
    }
    return spans
      .map((span) =>
        span.from === span.to
          ? `${dayName(span.from)} ${span.label}`
          : `${dayName(span.from)}–${dayName(span.to)} ${span.label}`,
      )
      .join(' • ');
  })();

  return (
    <footer>
      <div className="wrap foot">
        <div className="fbrand">
          <img src="/logo.webp" alt="" width="40" height="40" />
          <div>
            <strong>{business.name.toUpperCase()}</strong>
            <span>BEAUTY. CONFIDENCE. YOU.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1.2rem', marginTop: '0.6rem' }}>
          {business.address && (
            <address style={{ fontStyle: 'normal', fontSize: '0.9rem' }}>{business.address}</address>
          )}
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{hoursLine}</p>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <a href={`tel:${business.phone}`} style={{ color: '#ffc7d8' }}>
              {formatPhoneForDisplay(business.phone)}
            </a>
          </p>
        </div>

        <div className="flinks">
          <Link href="/#services">Services</Link>
          <Link href="/prices">Prices</Link>
          <Link href="/book">Book online</Link>
          <Link href="/#visit">Visit</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/admin">Staff login</Link>
        </div>
        <small style={{ paddingBottom: chatWidgetPresent ? '4rem' : undefined }}>
          © {new Date().getFullYear()} {business.name} • Thank you for choosing us ♥
        </small>
      </div>
    </footer>
  );
}

'use client';

/**
 * Last resort when the root layout itself fails to render — which in practice
 * means the database was unreachable, since the layout reads the business row.
 *
 * Next replaces the entire document here, so this file carries its own <html>
 * and <body> and cannot rely on globals.css being applied. The styles are
 * inline for that reason.
 *
 * It deliberately shows no phone number or address. Those live in one place,
 * the `businesses` row, and that row is exactly what could not be read — a
 * hardcoded copy here would be a second source of NAP that nobody would
 * remember to update, which is the problem §8 is about. A customer who cannot
 * load the site still has the Google listing, which is where they found it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-ZA">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fdf8f7',
          color: '#2a1626',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '2rem',
        }}
      >
        <main style={{ maxWidth: '26rem' }}>
          <p
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#8f6d37',
              margin: 0,
            }}
          >
            Smart Nails and Beauty Spa
          </p>

          <h1 style={{ fontSize: '1.75rem', lineHeight: 1.2, margin: '0.75rem 0 0', fontWeight: 600 }}>
            We can&rsquo;t load the site right now.
          </h1>

          <p style={{ margin: '0.75rem 0 0', lineHeight: 1.6, color: '#7a5a72' }}>
            Something went wrong on our side, not yours. Try again in a moment. Any booking you
            already have is safe.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              border: 0,
              borderRadius: '999px',
              backgroundColor: '#c2185b',
              color: '#fdf8f7',
              padding: '0.85rem 1.75rem',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>

          {/* The digest is what makes a report actionable — it matches the entry
              in the hosting platform's runtime logs. */}
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: '#9b7f94' }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

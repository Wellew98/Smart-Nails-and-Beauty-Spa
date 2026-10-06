import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BookButton } from '@/components/book-button';
import { getActiveServices, getBusiness } from '@/lib/public-data';
import { lacquerFor } from '@/lib/palette';
import { formatDuration, formatZar } from '@/lib/money';
import { NAIL_PHOTOS, STUDIO_PHOTO } from '@/lib/photos';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Nail work from the studio in Glenanda, and the room you walk into. Book online.',
};

/**
 * The work, then the room, then the colour range.
 *
 * ---------------------------------------------------------------------------
 * THE PHOTOGRAPHS COME FIRST NOW, AND THE SWATCHES STAY.
 *
 * This page used to be swatches alone, with a note saying studio photographs
 * belonged on the Google listing "until the owner has her own". She does — they
 * are hers, off her own Business Profile — so the note is spent and the
 * pictures lead.
 *
 * The colour range stays underneath because it is not decoration: every swatch
 * links straight into `/book` for that treatment, so the most attractive thing
 * on the page is also the shortest path to the one job the site exists to do.
 * A photograph of somebody else's nails cannot do that.
 *
 * NOTHING HERE IS CAPTIONED "OUR WORK". Five of the nine carry the studio's
 * brand card in frame; four do not, and one of those looks like a catalogue
 * photo. What IS true of all of them is where they came from, so that is what
 * the page says. See the note at the top of lib/photos.ts.
 * ---------------------------------------------------------------------------
 */
export default async function GalleryPage() {
  const business = (await getBusiness())!;
  const services = await getActiveServices(business.id);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14 pb-4 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Gallery</p>
      <h1 className="font-display mt-4 max-w-[13ch] text-[2.5rem] leading-[1] font-semibold text-aubergine-900 sm:text-6xl">
        {SITE.gallery.lead}
      </h1>
      <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-mauve-500">
        {SITE.gallery.note}
      </p>

      {/* ---------------- the nail work ---------------- */}
      {/* A masonry-ish grid: the shots are mixed portrait and landscape, so
          each tile fixes its own aspect ratio and crops rather than letting one
          landscape photo punch a hole in the row. */}
      <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {NAIL_PHOTOS.map((photo, index) => (
          <li key={photo.src} className="overflow-hidden rounded-xl bg-blush-100">
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              // The first row is above the fold on a phone; the rest can wait.
              priority={index < 2}
              sizes="(min-width: 640px) 33vw, 50vw"
              className="aspect-[3/4] w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
            />
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-relaxed text-mauve-400">
        Our own studio photographs are on the way. The colour range below is ready to book.
      </p>

      {/* ---------------- the room ---------------- */}
      <section aria-labelledby="studio-heading" className="mt-20 sm:mt-28">
        <h2
          id="studio-heading"
          className="font-display text-2xl font-semibold text-aubergine-900"
        >
          The studio
        </h2>
        <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-mauve-500">
          You will find us at 75 Amanda Avenue in Glenanda. Manicure stations, a treatment room
          behind, and the kettle on.
        </p>

        <div className="mt-7 overflow-hidden rounded-2xl bg-blush-100">
          <Image
            src={STUDIO_PHOTO.src}
            alt={STUDIO_PHOTO.alt}
            width={STUDIO_PHOTO.width}
            height={STUDIO_PHOTO.height}
            sizes="(min-width: 1024px) 64rem, 100vw"
            className="w-full object-cover"
          />
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-5">
          {business.google_maps_url && (
            <a
              href={business.google_maps_url}
              className="text-sm text-lacquer-500 underline underline-offset-4 hover:text-lacquer-600"
            >
              See us on Google
            </a>
          )}
          <BookButton variant="outline" />
        </div>
      </section>

      {/* ---------------- the colour range ---------------- */}
      <section aria-labelledby="range-heading" className="mt-20 border-t border-gilt-200/70 pt-12 sm:mt-28">
        <h2 id="range-heading" className="font-display text-2xl font-semibold text-aubergine-900">
          A colour for every treatment
        </h2>
        <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-mauve-500">
          Each treatment carries its own colour across the site. Tap one to book it.
        </p>

        <ul className="mt-9 grid grid-cols-3 gap-x-5 gap-y-9 sm:grid-cols-4 sm:gap-x-8 lg:grid-cols-6">
          {services.map((service) => {
            const lacquer = lacquerFor(service.name);
            return (
              <li key={service.id}>
                <Link href={`/book?service=${service.id}`} className="group block">
                  <span
                    aria-hidden="true"
                    className="swatch block aspect-[3/4] w-full transition-transform duration-300 group-hover:-translate-y-1"
                    style={{
                      ['--swatch' as string]: lacquer.base,
                      ['--swatch-tint' as string]: lacquer.tint,
                    }}
                  />
                  <span
                    className="mt-3 block font-mono text-[0.65rem] tracking-[0.14em] uppercase"
                    style={{ color: lacquer.ink }}
                  >
                    {lacquer.shade}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-aubergine-900">
                    {service.name}
                  </span>
                  <span className="tabular mt-1 block text-xs text-mauve-400">
                    {formatDuration(service.duration_minutes)} · {formatZar(service.price_cents)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

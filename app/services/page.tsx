import { redirect } from 'next/navigation';

/**
 * The flyer price list lives at /prices now (single canonical list,
 * price-only, exactly as the flyer). This route redirects there so old
 * links and bookmarks keep working instead of showing a second,
 * competing menu.
 */
export default function ServicesPage() {
  redirect('/prices');
}

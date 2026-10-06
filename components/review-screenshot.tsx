import type { Review } from '@/lib/reviews';

/**
 * One review, as the owner's screenshot of Google's own review panel.
 *
 * ---------------------------------------------------------------------------
 * WHY A PLAIN <img> AND NOT next/image
 *
 * next/image needs the intrinsic width and height up front, or a `fill` parent
 * with the aspect ratio pinned. Both mean this code carries numbers that must
 * match the files byte for byte, and these files get replaced: a fresh capture
 * at a different zoom, a review edited and re-shot, a fifth one added. A stale
 * number there does not fail the build, it silently squashes a screenshot, and
 * a squashed screenshot of a review is worse than none.
 *
 * `w-full h-auto` needs no numbers and cannot distort. The cost is that the
 * browser does not know the height in advance, so the images below sit in a
 * grid whose rows the browser resolves before paint, and `loading="lazy"`
 * keeps them off the critical path. These are small captures of a text panel
 * at the very foot of the page, not hero photography.
 *
 * WHY IT IS MOUNTED ON WHITE. The screenshots have Google's own white
 * background, which would otherwise float unbounded on the blush band and read
 * as a rendering fault. A white card with a hairline and a soft shadow gives
 * each one an edge and makes it read as what it is: a clipping, pasted up.
 * ---------------------------------------------------------------------------
 */
export function ReviewScreenshot({ review }: { review: Review }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-gilt-200/70 bg-white p-2 shadow-sm sm:p-3">
      <img
        src={review.screenshot}
        /* The words, for a screen reader and for a crawler, which a bare
           picture of text gives neither. */
        alt={`Google review from ${review.author}, ${review.rating} out of 5 stars: “${review.quote}”`}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-lg"
      />
    </figure>
  );
}

/**
 * Guest reviews from the Google Business Profile, shown as the owner's own
 * screenshots of Google's review panel.
 *
 * ---------------------------------------------------------------------------
 * THE SCREENSHOT IS THE POINT. DO NOT REBUILD THESE AS STYLED TEXT.
 *
 * This was tried and it was wrong. The reviews were transcribed into cards
 * built out of the site's own fonts, colours and a painted-nail rating, on
 * reasoning about reflow and screen readers. It reads better and it proves
 * nothing: a visitor looking at our markup, in our typeface, saying nice
 * things about us has no reason to believe any of it. Every business on earth
 * can type that.
 *
 * A screenshot of Google's panel is evidence. The reviewer's own Google
 * profile photograph, Google's gold stars, Google's "Local Guide" badge and
 * Google's layout are all things this site cannot fake, and that is exactly
 * why they carry weight. The correct move is to show the picture Google drew.
 *
 * So: the image is what goes on the page. The transcription below stays, but
 * it is now the ALT TEXT and nothing else. That is not a consolation prize.
 * It is how a screen reader gets the review at all, and how the words end up
 * in the page for a search engine, which a bare image would lose.
 * ---------------------------------------------------------------------------
 *
 * WHERE THE FILES COME FROM
 *
 * The owner supplied five screenshots of the review panel in August 2026 (four
 * reviews; Rachel Molongoana was sent twice, and the duplicate is not kept).
 * They live in `public/reviews/` and are referenced by `screenshot` below.
 *
 * They arrived as PNGs and were converted to **lossless** webp, which matches
 * `public/photos/` and halved the weight (105KB to 47KB across the four).
 * Lossless is not fussiness: these are small grey glyphs on flat white, and
 * lossy webp rings around exactly those edges, so the compression artefact
 * lands on the one thing the picture exists to show. Verified pixel-identical
 * to the PNGs after conversion, byte for byte across all four. If they are ever
 * re-exported, keep `lossless: true` and check the text at full size.
 *
 * `public/` is served, so each of these is a live URL on the studio's own
 * domain, which is deliberate here and worth being clear about: publishing them
 * republishes four reviewers' Google profile photographs. These are the
 * studio's own reviews, already public on its Google listing, and the owner has
 * asked for them to go up as they are.
 *
 * ---------------------------------------------------------------------------
 * ⛔ FOUR FIVE-STAR REVIEWS ARE STILL NOT A RATING FOR THE BUSINESS
 *
 * The profile shows 3.7 across 77. Quoting the good ones is the owner's to
 * choose; adding them up is a different claim and the site does not make it:
 *
 *   - no average, no review count, no "rated 5 stars" in any copy;
 *   - no `aggregateRating` and no `review` in the JSON-LD. That rule is older
 *     than this file and lives in components/local-business-jsonld.tsx: Google
 *     forbids a site marking up its own ratings about itself;
 *   - the section links out to the listing, so a reader is one tap from all of
 *     them. That link is load-bearing. Do not remove it.
 * ---------------------------------------------------------------------------
 */

export interface Review {
  author: string;
  /**
   * The screenshot of Google's review panel. This is what renders.
   *
   * Sized by CSS rather than by intrinsic width and height, so replacing a file
   * with a differently-sized capture needs no code change and cannot put a
   * wrong aspect ratio on the page. See components/review-screenshot.tsx.
   */
  screenshot: string;
  /**
   * The review as written, verbatim, spelling and punctuation and all. It is
   * the image's alt text, so a screen reader and a crawler both get the words.
   * Do not tidy it: "U made my birthday so relaxing" is how it was left.
   */
  quote: string;
  /** Out of five, as left. Read out in the alt text with the quote. */
  rating: number;
}

/**
 * In the order they go up: the long, specific massage review first, then the
 * one about the work itself, then the two short ones.
 *
 * ON THE R100 LINE in the first. It mentions paying for "their January special
 * (R100 for 45min massage)", which is a price the menu does not offer. It is
 * plainly past tense and tied to a named month. It is also a photograph of what
 * she wrote, so unlike a transcription it cannot be trimmed: the only choice is
 * to show the review or not show it. It goes up.
 *
 * Jane Steuart's was truncated by Google's own "…More" in the panel, so both
 * the picture and the alt text carry the visible sentence and not the whole
 * review.
 */
/**
 * No reviews yet. Smart's Google listing is new and the owner has not supplied
 * review screenshots. These were Grace's reviews in the template build and
 * must never ship here — quoting another business's customers as our own.
 *
 * TODO(owner): add Smart's own screenshots to `public/reviews/` and list them
 * here, following the screenshot rules in this file's header. The homepage
 * section renders only when this array is non-empty.
 */
export const REVIEWS: Review[] = [];

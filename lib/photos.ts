/**
 * PLACEHOLDERS — Smart Nails has not supplied studio photographs yet.
 *
 * The four nail shots below are unbranded stand-ins carried over from the
 * template build so the gallery and hero have something to show. They are NOT
 * captioned as Smart's work anywhere. The hero/studio image IS Smart's own
 * promo artwork (`public/smart-promo.webp`).
 *
 * TODO(owner): replace NAIL_PHOTOS with Smart's own photos (off its Google
 * Business Profile or supplied directly) and set ownWork where the brand card
 * is visible, per the rule in lib/site.ts.
 *
 * The studio's own photographs, from its Google Business Profile.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MODULE AND NOT A `readdir` OF public/photos
 *
 * Two things have to travel with each file and cannot be derived from it: the
 * alt text, and how much we actually know about where it came from.
 *
 * The alt text matters because these are the only photographs on the site — a
 * gallery of ten unlabelled images is unusable with a screen reader, and
 * "nails-06-hotpink-square.webp" is not a description.
 *
 * The provenance matters because of the rule at the top of `lib/site.ts`: the
 * site makes only claims that can be checked. Five of these carry the studio's
 * own brand card in frame, so they are demonstrably its work. Four do not —
 * one of them is a customer's selfie and one looks like a catalogue photo. So
 * nothing here is captioned "our work". The gallery says where the pictures
 * came from, which is true of all of them, and says nothing about who did the
 * nails, which is not established for four.
 *
 * `docs/source-material/README.md` has the full reasoning. When the owner
 * confirms the four, `ownWork` is the only thing that needs changing.
 * ---------------------------------------------------------------------------
 */

export interface Photo {
  src: string;
  /** Intrinsic size, so next/image can reserve space and never shift layout. */
  width: number;
  height: number;
  /** Describes the image itself. Never a claim about who made it. */
  alt: string;
  /**
   * Is the studio's own brand card visible in the shot?
   *
   * The only evidence available without asking the owner. False does not mean
   * "not theirs" — it means "not established", which is why the site does not
   * assert it either way.
   */
  ownWork: boolean;
}

/** Placeholder nail shots until Smart supplies its own (see header). */
export const NAIL_PHOTOS: Photo[] = [
  {
    src: '/photos/nails-03-nude-ombre-coffin.webp',
    width: 765,
    height: 1020,
    alt: 'Coffin-shaped nails in a nude to white ombre.',
    ownWork: false,
  },
  {
    src: '/photos/nails-06-hotpink-square.webp',
    width: 765,
    height: 1020,
    alt: 'Square nails in a bright hot pink.',
    ownWork: false,
  },
  {
    src: '/photos/nails-07-red-french-coffin.webp',
    width: 720,
    height: 884,
    alt: 'Long coffin nails with bright red french tips.',
    ownWork: false,
  },
  {
    src: '/photos/nails-04-yellow-coffin.webp',
    width: 765,
    height: 1020,
    alt: 'Coffin nails in a soft buttery yellow.',
    ownWork: false,
  },
];

/**
 * Smart's own promo artwork — the only studio image supplied so far. Carries
 * the hero background and the gallery's studio section until real interior
 * shots arrive.
 */
export const STUDIO_PHOTO: Photo = {
  src: '/smart-promo.webp',
  width: 1021,
  height: 1021,
  alt: 'Smart Nails and Beauty Spa artwork: pink nails with glitter accents, orchids and candlelight.',
  ownWork: true,
};

/**
 * Every treatment gets a lacquer colour — the design's organising device.
 *
 * The colours are curated for the seeded range rather than stored in the
 * database, so adding a service never blocks on a schema change. Anything not
 * named here falls back to a stable hash into the same range, so a new
 * treatment still looks deliberate the moment the owner adds it.
 */

export interface Lacquer {
  /** Deep tone — the body of the swatch. */
  base: string;
  /** Lighter tone — the top of the gradient. */
  tint: string;
  /** Readable-on-blush text colour for the treatment's name. */
  ink: string;
  /** The shade's name, shown like a polish label. */
  shade: string;
}

const RANGE: Record<string, Lacquer> = {
  'full body massage': { base: '#4A6247', tint: '#6E8A69', ink: '#3B4F39', shade: 'Eucalyptus' },
  'back & neck massage': { base: '#9A5A22', tint: '#C4813F', ink: '#7C4718', shade: 'Amber Room' },
  'classic facial': { base: '#C05C4C', tint: '#E08573', ink: '#9A463A', shade: 'Soft Coral' },
  'gel manicure': { base: '#A01049', tint: '#D94A80', ink: '#8E0D41', shade: 'House Lacquer' },
  pedicure: { base: '#5B3A6E', tint: '#815995', ink: '#4B2F5B', shade: 'Plum Velvet' },
};

/** Used when a treatment is not in the curated range. */
const FALLBACK: Lacquer[] = [
  { base: '#7A3350', tint: '#A55873', ink: '#682B44', shade: 'Rosewood' },
  { base: '#2F5D62', tint: '#4E858B', ink: '#274E52', shade: 'Deep Jade' },
  { base: '#8A6A2F', tint: '#B79350', ink: '#725726', shade: 'Antique Gold' },
  { base: '#4B4A7A', tint: '#7170A5', ink: '#3E3D66', shade: 'Iris' },
  { base: '#A8434B', tint: '#CE6E74', ink: '#8C363D', shade: 'Garnet' },
];

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index++) {
    total = (total * 31 + value.charCodeAt(index)) >>> 0;
  }
  return total;
}

export function lacquerFor(serviceName: string): Lacquer {
  const key = serviceName.trim().toLowerCase();
  return RANGE[key] ?? FALLBACK[hash(key) % FALLBACK.length];
}

/**
 * The homepage's four doors, as a set of colours rather than four independent
 * ones — they are seen side by side and nowhere else, so they are picked to sit
 * together: the house pink leads, then plum, then the green of the studio's own
 * foliage wall, then the gilt already used for the site's hairlines.
 *
 * Deliberately NOT `lacquerFor(label)`. That hashes into a five-colour fallback
 * range, so labels collide: two treatments on /services already come out "Iris".
 *
 * The gallery's door was built as a PHOTOGRAPH of real nail work, cut to the
 * nail outline, on the reasoning that the door may as well show what is behind
 * it. Rendered at the size it is actually used, 56px across, it read as a
 * sticker rather than a nail, and beside three flat lacquers it looked like a
 * broken image. Four colours it is. Do not re-litigate it without looking at
 * it on screen first.
 */
export const DESTINATION_LACQUERS: Record<string, Lacquer> = {
  treatments: { base: '#a01049', tint: '#d94a80', ink: '#8E0D41', shade: 'House Lacquer' },
  gallery: { base: '#5B3A6E', tint: '#815995', ink: '#4B2F5B', shade: 'Plum Velvet' },
  about: { base: '#4A6247', tint: '#6E8A69', ink: '#3B4F39', shade: 'Eucalyptus' },
  contact: { base: '#8A6A2F', tint: '#B79350', ink: '#725726', shade: 'Antique Gold' },
};

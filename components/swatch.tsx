import type { CSSProperties } from 'react';
import { type Lacquer, lacquerFor } from '@/lib/palette';

/**
 * The signature element: a painted nail.
 *
 * Nothing else on the site carries a gradient or a gloss, so this shape is the
 * one thing a returning visitor recognises. Sizes are deliberately limited — a
 * nail in the hero strip, a chip beside a treatment, a dot in a list, and
 * nothing else.
 *
 * ---------------------------------------------------------------------------
 * ON THE PROPORTIONS
 *
 * These were 1:3 — the proportions of a paint-chart stick, not a nail. Rendered
 * ten across in the hero strip they read as a bar chart, which is exactly the
 * thing a colour range should not look like.
 *
 * Every size is now about 1:1.4, which is a nail with a short free edge, and
 * `.swatch` in globals.css carries the shape: a squoval tip and a curved
 * cuticle end. If you change one, change the other — the proportion and the
 * curve only read as a nail together. Compared six shapes in a browser at
 * three sizes before settling on these.
 * ---------------------------------------------------------------------------
 */
export function Swatch({
  serviceName,
  size = 'chip',
  className = '',
  style,
  lacquer: override,
}: {
  serviceName: string;
  size?: 'stick' | 'tile' | 'chip' | 'dot';
  className?: string;
  style?: CSSProperties;
  /**
   * An explicit colour, for the few swatches that do not stand for a treatment.
   *
   * The homepage's destination tiles are the only case: their colours are
   * chosen so the four sit together, and `lacquerFor` cannot do that. It hashes
   * a name into a five-colour fallback range, so two of four labels landing on
   * the same colour is likely rather than unlucky — it already happens on the
   * treatment list, where two services both come out "Iris".
   */
  lacquer?: Lacquer;
}) {
  const lacquer = override ?? lacquerFor(serviceName);
  const dimensions =
    size === 'stick'
      ? 'w-16 h-[5.5rem] sm:w-[4.5rem] sm:h-[6.25rem]'
      : size === 'tile'
        ? 'w-9 h-12 sm:w-14 sm:h-[4.75rem]'
        : size === 'chip'
          ? 'w-7 h-10'
          : 'w-3.5 h-5';

  return (
    <span
      aria-hidden="true"
      className={`swatch block shrink-0 ${dimensions} ${className}`}
      style={{ ['--swatch' as string]: lacquer.base, ['--swatch-tint' as string]: lacquer.tint, ...style }}
    />
  );
}

import Image from 'next/image';

/**
 * Smart Nails and Beauty Spa — real logo file.
 *
 * Unlike Grace (drawn SVG from a banner photo), Smart supplied
 * `logo.webp`: black disc, SMART in purple, NAILS AND BEAUTY SPA
 * beneath, pink splash ring. Served as a file so header, hero and
 * chat widget share one import.
 */
export function SmartMark({
  className,
  title,
}: {
  className?: string;
  variant?: 'full' | 'compact';
  title?: string;
}) {
  return (
    <Image
      src="/smart-logo.webp"
      alt={title ?? 'Smart Nails and Beauty Spa'}
      width={220}
      height={220}
      sizes="(min-width: 640px) 8rem, 6rem"
      className={className}
      priority={false}
    />
  );
}

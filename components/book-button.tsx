import Link from 'next/link';

/**
 * Spec §8 Phase 1: every page has a visible Book button. This is that button,
 * so there is one place to change how it looks and where it points.
 */
export function BookButton({
  children = 'Book a treatment',
  href = '/book',
  variant = 'solid',
  className = '',
}: {
  children?: React.ReactNode;
  href?: string;
  variant?: 'solid' | 'outline' | 'compact';
  className?: string;
}) {
  const styles = {
    solid:
      'bg-lacquer-500 text-blush-50 px-7 py-3.5 text-base hover:bg-lacquer-600 active:bg-lacquer-600 shadow-[0_1px_0_rgba(42,22,38,0.15)]',
    outline:
      'border border-aubergine-900/25 text-aubergine-900 px-7 py-3.5 text-base hover:border-aubergine-900/60 hover:bg-blush-100',
    compact: 'bg-lacquer-500 text-blush-50 px-4 py-2 text-sm hover:bg-lacquer-600',
  }[variant];

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full font-medium tracking-tight transition-colors ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

import Link from 'next/link';

/**
 * Spec §8 Phase 1: every page has a visible Book button. This is that button,
 * so there is one place to change how it looks and where it points.
 * Styled on the flyer's own buttons (pink pill / ghost).
 */
export function BookButton({
  children = 'Book online',
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
    solid: 'btn-pink',
    outline: 'btn-ghost',
    compact: 'btn-dark btn-sm',
  }[variant];

  return (
    <Link href={href} className={`btn ${styles} ${className}`}>
      {children}
    </Link>
  );
}

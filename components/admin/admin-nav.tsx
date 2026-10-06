'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const LINKS = [
  { href: '/admin', label: 'Today' },
  { href: '/admin/week', label: 'Week' },
  { href: '/admin/walk-in', label: 'Walk-in' },
  { href: '/admin/blocks', label: 'Block' },
  { href: '/admin/vouchers', label: 'Vouchers' },
  { href: '/admin/chats', label: 'Chats' },
  { href: '/admin/settings', label: 'Setup' },
];

/**
 * Built for a phone held in one hand: the nav is a thumb-reachable row, and
 * Today is always first because it is the screen she opens twenty times a day.
 */
export function AdminNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gilt-200/70 bg-blush-50/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <span className="font-display text-base font-semibold text-aubergine-900">Diary</span>
        <span className="ml-auto truncate text-xs text-mauve-400">{email}</span>
        <button
          type="button"
          onClick={signOut}
          className="text-xs text-mauve-500 underline underline-offset-4 hover:text-aubergine-900"
        >
          Sign out
        </button>
      </div>

      <nav aria-label="Admin" className="scrollbar-none overflow-x-auto">
        <ul className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-aubergine-900 text-blush-50'
                      : 'text-mauve-600 hover:bg-blush-100'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

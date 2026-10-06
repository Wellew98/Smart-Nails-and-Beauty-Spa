'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client — sign-in and sign-out only.
 *
 * The anon key is public by design and gated by RLS. The service role key must
 * never appear in any file that ships to the browser (spec §7); it is read only
 * inside `server-only` modules.
 */
export function createClient() {
  // Both names are read because Supabase's newer projects issue
  // `sb_publishable_…` keys under NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, while
  // older ones use the anon key. Inlined rather than imported from the server
  // module so nothing server-only is pulled into the browser bundle.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!);
}

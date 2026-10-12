import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth callback: Supabase email links (password recovery) land here with a
 * `?code=`, the code is exchanged for a session, and the owner continues to
 * `?next=` (default /admin/reset). No signup flow points here — account
 * creation happens only in the Supabase dashboard, never on the site.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/admin/reset';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

import 'server-only';
import { redirect } from 'next/navigation';
import { createClient, supabaseConfigured } from './server';

export interface OwnerSession {
  userId: string;
  email: string | null;
  businessId: string;
}

/**
 * The gate on every admin page and every admin write.
 *
 * `business_members` is read through the owner's OWN session, so the row only
 * comes back if the RLS policy says it belongs to them. That makes the
 * business id we then use for writes something the database vouched for,
 * rather than something the request claimed.
 */
export async function getOwnerSession(): Promise<OwnerSession | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();

  // getUser() revalidates the JWT with Supabase. getSession() reads it from a
  // cookie the client could have written, so it must not be trusted here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  return { userId: user.id, email: user.email ?? null, businessId: membership.business_id };
}

/** Redirects to the login screen when there is no owner session. */
export async function requireOwner(): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) redirect('/admin/login');
  return session;
}

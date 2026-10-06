import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/login-form';
import { getOwnerSession } from '@/lib/supabase/session';
import { getBusiness } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getOwnerSession();
  if (session) redirect('/admin');

  // From the database row, not a literal — the name is NAP and lives in one place.
  const business = await getBusiness();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-16">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">{business?.name ?? 'Admin'}</p>
      <h1 className="font-display mt-3 text-3xl font-semibold text-aubergine-900">Sign in</h1>
      <p className="mt-2 text-sm text-mauve-500">The diary, bookings and setup.</p>
      <LoginForm />
    </div>
  );
}

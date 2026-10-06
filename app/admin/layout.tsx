import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/admin-nav';
import { getOwnerSession } from '@/lib/supabase/session';
import { supabaseConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Admin shell.
 *
 * Reads below this point resolve `businessId` from `requireOwner()`, which
 * looks up `business_members` through the owner's own Supabase session — so
 * RLS is what decides which business she belongs to (§7). Subsequent queries
 * use the transactional connection scoped to that id, because the admin needs
 * joins and transactions the PostgREST client cannot express. The id itself is
 * never taken from the request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <h1 className="font-display text-2xl font-semibold text-aubergine-900">
          Admin not configured
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mauve-500">
          Signing in needs the two Supabase keys, and this deployment does not have them. The rest
          of the site works without them, which is why only this page is affected.
        </p>

        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-mauve-600">
          <li>
            Set <code className="text-aubergine-900">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-aubergine-900">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
            {process.env.VERCEL ? (
              <>
                {' '}
                in Vercel under <strong>Settings → Environment Variables</strong>, then{' '}
                <strong>redeploy</strong>. These are baked in at build time, so an existing build
                will not pick them up.
              </>
            ) : (
              <>
                {' '}
                in <code className="text-aubergine-900">.env.local</code>.
              </>
            )}
          </li>
          <li>
            Create the owner in Supabase → <strong>Authentication → Users → Add user</strong>, with{' '}
            <strong>Auto Confirm User</strong> ticked.
          </li>
          <li>
            In the SQL editor, link her to the business:
            <code className="mt-1.5 block rounded-lg bg-blush-100 px-3 py-2 text-xs break-all text-aubergine-900">
              insert into business_members (user_id, business_id) values (&apos;&lt;her
              uid&gt;&apos;, &apos;00000000-0000-4000-8000-0000000000b1&apos;);
            </code>
          </li>
        </ol>

        <p className="mt-4 text-xs text-mauve-400">
          Without step 3 she can sign in and still see nothing: the row-level security policy has
          no business to show her.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-lacquer-500 underline underline-offset-4"
        >
          Back to the site
        </Link>
      </div>
    );
  }

  const session = await getOwnerSession();

  // The login page renders inside this layout, so it must not be gated.
  if (!session) return <>{children}</>;

  return (
    <div className="min-h-screen bg-blush-50">
      <AdminNav email={session.email} />
      <div className="mx-auto max-w-3xl px-4 pb-24">{children}</div>
    </div>
  );
}

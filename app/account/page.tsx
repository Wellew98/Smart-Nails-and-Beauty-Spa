import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountView } from '@/components/account-view';
import { claimByEmail, findCustomerByClerkId, getVisits } from '@/lib/account';
import { getBusiness } from '@/lib/public-data';
import type { Visit } from '@/lib/account';

export const metadata: Metadata = {
  title: 'Your visits',
  description: 'Sign in to see your visits and rebook in one tap.',
};

// Membership state is per visitor; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

/**
 * Outcomes build (video system 1): /account.
 *
 * No Clerk keys, disabled state (same pattern as the AI assistant). Keys,
 * real sign-in: the visitor's Clerk id is claimed against her customer row
 * by email, and her visits render below. Guest booking is untouched.
 */
export default async function AccountPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <section className="section" id="account">
        <div className="wrap">
          <p className="eyebrow">Members</p>
          <h2>Your visits, in one place</h2>
          <p className="sub">Member accounts are not switched on yet. Booking works exactly as before.</p>
          <p className="fine">
            <Link href="/book">Book a visit</Link>
          </p>
        </div>
      </section>
    );
  }

  const { auth, currentUser } = await import('@clerk/nextjs/server');
  const { userId } = await auth();

  let visits: Visit[] = [];
  if (userId) {
    const business = await getBusiness();
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? null;
    if (business && email) {
      const customer =
        (await findCustomerByClerkId(business.id, userId)) ??
        (await claimByEmail(business.id, userId, email));
      if (customer) visits = await getVisits(customer.id);
    } else if (business) {
      const customer = await findCustomerByClerkId(business.id, userId);
      if (customer) visits = await getVisits(customer.id);
    }
  }

  return <AccountView visits={visits} />;
}

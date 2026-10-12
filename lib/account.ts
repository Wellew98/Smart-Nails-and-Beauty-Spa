import 'server-only';
import { query, queryOne } from './db';
import type { Customer } from './types';

/**
 * Customer accounts (outcomes build, video system 1: Clerk).
 *
 * Identity stays phone-based exactly as before; `clerk_user_id` is only a
 * link so a signed-in customer sees her own visits. Guest booking is
 * untouched: no row ever requires a Clerk id.
 */

export interface Visit {
  id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  service_name: string;
  staff_name: string;
  price_cents_at_booking: number;
  manage_token: string;
}

export async function findCustomerByClerkId(
  businessId: string,
  clerkId: string,
): Promise<Customer | null> {
  return queryOne<Customer>(
    'select * from customers where business_id = $1 and clerk_user_id = $2',
    [businessId, clerkId],
  );
}

export async function findCustomerByEmail(
  businessId: string,
  email: string,
): Promise<Customer | null> {
  return queryOne<Customer>(
    'select * from customers where business_id = $1 and lower(email) = lower($2)',
    [businessId, email],
  );
}

/** Attach a Clerk id to a customer row. Never steals another user's link. */
export async function linkClerkId(customerId: string, clerkId: string): Promise<void> {
  await query(
    `update customers set clerk_user_id = $2
      where id = $1 and (clerk_user_id is null or clerk_user_id = $2)`,
    [customerId, clerkId],
  );
}

/**
 * Claim-by-email: a customer who booked as a guest with an email, then signs
 * in with the same address, inherits her history. Returns the linked row, if
 * any. Erased rows (forget-me path) can never be claimed: their email is
 * already null and their phone carries the erased prefix.
 */
export async function claimByEmail(
  businessId: string,
  clerkId: string,
  email: string,
): Promise<Customer | null> {
  const already = await findCustomerByClerkId(businessId, clerkId);
  if (already) return already;
  const guest = await findCustomerByEmail(businessId, email);
  if (!guest) return null;
  await linkClerkId(guest.id, clerkId);
  return (await findCustomerByClerkId(businessId, clerkId)) ?? guest;
}

export async function getVisits(customerId: string): Promise<Visit[]> {
  return query<Visit>(
    `select a.id, a.starts_at, a.ends_at, a.status,
            s.name as service_name, st.name as staff_name,
            a.price_cents_at_booking, a.manage_token
       from appointments a
       join services s on s.id = a.service_id
       join staff st on st.id = a.staff_id
      where a.customer_id = $1
        and a.status in ('pending','confirmed','completed')
      order by a.starts_at desc`,
    [customerId],
  );
}

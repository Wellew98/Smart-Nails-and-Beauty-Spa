import { NextResponse } from 'next/server';
import { getBusiness } from '@/lib/public-data';
import { sendWelcome } from '@/lib/email';
import { findCustomerByEmail, linkClerkId } from '@/lib/account';

export const dynamic = 'force-dynamic';

/**
 * Outcomes build (video system 1+2): Clerk user.created webhook.
 *
 * Links the Clerk user to the salon customer row by email (claim-by-email,
 * same as the account page) and sends the welcome mail. Every failure mode
 * resolves to "link what you can, report what you did" — a webhook that
 * 500s gets retried by Clerk and would double-send the welcome.
 */
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, disabled: true, message: 'CLERK_WEBHOOK_SECRET not configured.' },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const { Webhook } = await import('svix');
  let evt: { type: string; data: Record<string, unknown> };
  try {
    // svix v2 verifies only: it returns undefined and throws on a bad
    // signature. The event body is parsed separately — reading it from the
    // return value was a v1 habit that crashed every real delivery.
    new Webhook(secret).verify(raw, {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    });
    evt = JSON.parse(raw) as unknown as typeof evt;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad signature.' }, { status: 400 });
  }

  if (evt.type !== 'user.created') return NextResponse.json({ ok: true, ignored: evt.type });

  const data = evt.data;
  const clerkId = typeof data.id === 'string' ? data.id : null;
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const email = addresses
    .map((entry) => (entry as { email_address?: unknown }).email_address)
    .find((value): value is string => typeof value === 'string');
  const firstName =
    typeof data.first_name === 'string' && data.first_name.trim().length > 0
      ? data.first_name.trim()
      : null;

  const business = await getBusiness();
  if (!clerkId || !email || !business) {
    return NextResponse.json({ ok: true, linked: false, welcomed: false });
  }

  const customer = await findCustomerByEmail(business.id, email);
  if (customer) await linkClerkId(customer.id, clerkId);

  const welcomed = await sendWelcome({
    to: email,
    name: firstName ?? customer?.name ?? 'there',
    businessName: business.name,
    businessPhone: business.phone,
  });

  return NextResponse.json({ ok: true, linked: customer !== null, welcomed });
}

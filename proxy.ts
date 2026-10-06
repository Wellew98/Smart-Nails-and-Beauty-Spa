import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth token on admin requests.
 *
 * Server Components cannot write cookies, so without this the owner's session
 * would silently expire mid-shift and she would be bounced to the login screen
 * while standing at the counter with a customer.
 *
 * ---------------------------------------------------------------------------
 * THIS MUST NEVER BE ABLE TO TAKE THE SITE DOWN.
 *
 * It did once. As `middleware.ts` with no error handling, a failure inside it
 * surfaced on Vercel as MIDDLEWARE_INVOCATION_FAILED — a 500 served in place of
 * the page. Refreshing an auth token is a convenience; the worst it should ever
 * cost is an early logout. So:
 *
 *   - Everything is inside a try/catch that falls back to letting the request
 *     through untouched.
 *   - @supabase/ssr is imported DYNAMICALLY, inside that try. A static import
 *     that fails to initialise throws before any handler code runs, where a
 *     try/catch around the body would never see it.
 *   - The matcher is limited to /admin, so the public site and the booking flow
 *     do not execute this code at all.
 *
 * Named `proxy` in `proxy.ts`: Next 16 renamed the middleware convention, and
 * the old filename now logs a deprecation and runs through a compatibility
 * path. Next resolves `mod.proxy` from this file.
 * ---------------------------------------------------------------------------
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Nothing to refresh without credentials. The admin renders its own
  // "not configured" page in that case.
  if (!url || !key) return NextResponse.next();

  try {
    const { createServerClient } = await import('@supabase/ssr');

    const response = NextResponse.next();

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Written to the response only. Rewriting the request as well buys
          // nothing here — the refreshed token is picked up on the next
          // request — and costs the fragility this whole comment is about.
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Revalidates the JWT and triggers a refresh when it is close to expiry.
    await supabase.auth.getUser();

    return response;
  } catch (error) {
    // An expired session is recoverable by signing in again. A 500 on every
    // admin page is not.
    console.error('[proxy] session refresh failed, continuing without it', error);
    return NextResponse.next();
  }
}

export const config = {
  // Admin only. The public site and the booking flow never run this.
  matcher: ['/admin/:path*'],
};

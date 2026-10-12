import { ClerkClient } from './clerk-client';

/**
 * Server gate: no Clerk keys, no Clerk JavaScript and no provider, so the
 * account page renders its disabled state instead of crashing. Same pattern
 * as the AI assistant. Nothing outside components/account-*, the Clerk
 * routes and these two files reads a Clerk variable.
 */
export function ClerkShell({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return <ClerkClient>{children}</ClerkClient>;
}

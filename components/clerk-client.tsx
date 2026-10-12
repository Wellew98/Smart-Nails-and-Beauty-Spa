'use client';

import { ClerkProvider } from '@clerk/nextjs';

/** Rendered only when Clerk keys exist (see ClerkShell). */
export function ClerkClient({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

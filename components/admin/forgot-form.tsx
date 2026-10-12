'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/auth/callback?next=/admin/reset`,
    });
    setBusy(false);
    // Same answer either way: confirming an address exists would tell an
    // attacker which emails have staff accounts.
    if (resetError) setError('We could not send that email. Check the address and try again.');
    else setSent(true);
  }

  if (sent) {
    return (
      <p className="mt-8 rounded-xl bg-blush-100 px-4 py-3 text-sm text-aubergine-900">
        If that address has a staff account, a reset link is on its way. It expires in an hour.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-aubergine-900">
          Staff email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-lacquer-500 px-6 py-3.5 text-base font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}

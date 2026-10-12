'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError('That link is expired or already used. Ask for a new one.');
      setBusy(false);
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm text-aubergine-900">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

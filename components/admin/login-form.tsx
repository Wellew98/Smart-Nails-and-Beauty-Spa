'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });

    if (signInError) {
      // Do not distinguish "no such user" from "wrong password" — that tells an
      // attacker which addresses are real.
      setError('That email and password do not match.');
      setBusy(false);
      return;
    }

    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-aubergine-900">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm text-aubergine-900">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
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
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

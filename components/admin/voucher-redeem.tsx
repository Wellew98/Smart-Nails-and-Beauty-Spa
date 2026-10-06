'use client';

import { useState, useTransition } from 'react';
import { checkVoucherAction, redeemVoucherForAppointmentAction } from '@/app/admin/actions';
import { formatZar } from '@/lib/money';

/**
 * The Today-screen and walk-in "Pay with voucher" flow — spa-voucher-build-
 * spec.md §4: "one screen and two taps." Check the code, confirm an amount,
 * done. Kept deliberately small: this is the flow that gets used on a busy
 * Saturday, and v2 §12.B is explicit that the thing that kills a system like
 * this is being slower than the paper book.
 */
export function VoucherRedeem({
  appointmentId,
  priceCents,
  onRedeemed,
}: {
  appointmentId: string;
  priceCents: number;
  onRedeemed?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<{
    purchaserName: string | null;
    balanceCents: number;
    expiresAt: string | null;
  } | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function check() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await checkVoucherAction(code);
      if (!response.ok) {
        setError(response.message);
        setChecked(null);
        return;
      }
      if (response.voucher.status === 'void') {
        setError('That voucher has been voided.');
        setChecked(null);
        return;
      }
      if (response.voucher.expired) {
        setError('That voucher has expired.');
        setChecked(null);
        return;
      }
      setChecked({
        purchaserName: response.voucher.purchaserName,
        balanceCents: response.voucher.balanceCents,
        expiresAt: response.voucher.expiresAt,
      });
      const suggested = Math.min(response.voucher.balanceCents, priceCents);
      setAmount(suggested > 0 ? String(suggested / 100) : '');
    });
  }

  function confirm() {
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) return;
    startTransition(async () => {
      const response = await redeemVoucherForAppointmentAction({ appointmentId, code, amountCents });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult(response.message ?? 'Redeemed.');
      setChecked(null);
      setCode('');
      setAmount('');
      onRedeemed?.();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-blush-200 bg-blush-50 px-3.5 py-3">
      {!checked ? (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Voucher code"
            className="min-w-0 flex-1 rounded-lg border border-blush-300 bg-white px-3 py-2 text-sm uppercase focus:border-aubergine-900 focus:outline-none"
          />
          <button
            type="button"
            disabled={pending || !code.trim()}
            onClick={check}
            className="shrink-0 rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
          >
            Check
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-mauve-600">
            {checked.purchaserName ?? 'Voucher'} · {formatZar(checked.balanceCents)} left
            {checked.expiresAt && ` · expires ${new Date(checked.expiresAt).toLocaleDateString('en-ZA')}`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mauve-500">Redeem R</span>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-24 rounded-lg border border-blush-300 bg-white px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={pending || !amount}
              onClick={confirm}
              className="rounded-full bg-lacquer-500 px-3.5 py-2 text-xs font-medium text-blush-50 disabled:opacity-50"
            >
              Redeem
            </button>
            <button
              type="button"
              onClick={() => setChecked(null)}
              className="rounded-full border border-blush-300 px-3 py-2 text-xs hover:bg-blush-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-lacquer-600">{error}</p>}
      {result && <p className="mt-2 text-xs text-sage-600">{result}</p>}
    </div>
  );
}

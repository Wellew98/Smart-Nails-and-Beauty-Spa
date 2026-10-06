'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  adjustVoucherAction,
  issueVoucherAction,
  resendVoucherEmailAction,
  voidVoucherAction,
} from '@/app/admin/actions';
import { formatZar } from '@/lib/money';

interface TransactionRow {
  id: string;
  kind: string;
  amountCents: number;
  reason: string | null;
  serviceName: string | null;
  createdAt: string;
}

interface VoucherRow {
  id: string;
  code: string;
  purchaserName: string | null;
  purchaserPhone: string | null;
  initialCents: number;
  balanceCents: number;
  status: string;
  expired: boolean;
  issuedAt: string;
  expiresAt: string | null;
  recipientEmail: string | null;
  emailedAt: string | null;
  note: string | null;
  transactions: TransactionRow[];
}

const dateFmt = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
function dateLabel(iso: string): string {
  return dateFmt.format(new Date(iso));
}

function statusLabel(voucher: VoucherRow): { text: string; tone: 'live' | 'spent' | 'expired' | 'void' } {
  if (voucher.status === 'void') return { text: 'Voided', tone: 'void' };
  if (voucher.expired) return { text: 'Expired', tone: 'expired' };
  if (voucher.balanceCents === 0) return { text: 'Spent', tone: 'spent' };
  return { text: 'Live', tone: 'live' };
}

const TONE_CLASSES: Record<string, string> = {
  live: 'bg-sage-500/15 text-sage-600',
  spent: 'bg-blush-200 text-mauve-500',
  expired: 'bg-lacquer-500/10 text-lacquer-600',
  void: 'bg-mauve-500/15 text-mauve-600',
};

export function VouchersManager({
  showAll,
  liabilityCents,
  vouchers,
}: {
  showAll: boolean;
  liabilityCents: number;
  vouchers: VoucherRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const [lastIssued, setLastIssued] = useState<{ code: string; lookupToken: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!needle) return vouchers;
    return vouchers.filter((voucher) => voucher.code.replace('-', '').includes(needle));
  }, [search, vouchers]);

  function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setFlash((current) => ({
        ...current,
        [key]: { ok: result.ok, text: result.message ?? (result.ok ? 'Done.' : 'That did not work.') },
      }));
      router.refresh();
    });
  }

  return (
    <div className="pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-aubergine-900">Vouchers</h1>
        <Link
          href={showAll ? '/admin/vouchers' : '/admin/vouchers?all=1'}
          className="rounded-full border border-blush-300 px-3.5 py-1.5 text-xs hover:bg-blush-100"
        >
          {showAll ? 'Show live only' : 'Show all'}
        </Link>
      </div>

      {/* §3: "put it on the vouchers admin screen as a single figure." */}
      <div className="mt-4 rounded-2xl border border-blush-200 bg-white px-5 py-4">
        <p className="text-xs text-mauve-400 uppercase">Outstanding liability</p>
        <p className="tabular mt-1 font-display text-2xl font-semibold text-aubergine-900">
          {formatZar(liabilityCents)}
        </p>
        <p className="mt-1 text-xs text-mauve-500">What the studio owes in services on live vouchers.</p>
      </div>

      <IssueForm
        pending={pending}
        onIssue={(input) =>
          startTransition(async () => {
            const result = await issueVoucherAction(input);
            if (result.ok) {
              setLastIssued(result.voucher);
              setSearch('');
            }
            setFlash((current) => ({ ...current, issue: { ok: result.ok, text: result.message } }));
            router.refresh();
          })
        }
        feedback={flash.issue}
        lastIssued={lastIssued}
      />

      <div className="mt-10">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code"
          className="w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-blush-200 bg-blush-100 px-6 py-10 text-center">
          <p className="text-aubergine-900">No vouchers here.</p>
          <p className="mt-1 text-sm text-mauve-500">
            {showAll ? 'Nothing has been issued yet.' : 'Nothing live right now — try "Show all".'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((voucher) => {
            const status = statusLabel(voucher);
            const open = expanded === voucher.id;
            return (
              <li key={voucher.id} className="rounded-2xl border border-blush-200 bg-white px-4 py-4">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : voucher.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="font-mono text-base tracking-[0.1em] text-aubergine-900">{voucher.code}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${TONE_CLASSES[status.tone]}`}>
                    {status.text}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mauve-500">
                    {voucher.purchaserName ?? 'No purchaser on file'}
                  </span>
                  <span className="tabular shrink-0 text-sm font-medium text-aubergine-900">
                    {formatZar(voucher.balanceCents)}
                    <span className="text-mauve-400"> / {formatZar(voucher.initialCents)}</span>
                  </span>
                </button>

                {open && (
                  <div className="mt-4 space-y-4 border-t border-blush-200 pt-4">
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-mauve-400 uppercase">Issued</dt>
                        <dd className="mt-0.5 text-aubergine-900">{dateLabel(voucher.issuedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-mauve-400 uppercase">Expires</dt>
                        <dd className="mt-0.5 text-aubergine-900">
                          {voucher.expiresAt ? dateLabel(voucher.expiresAt) : 'Never'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-mauve-400 uppercase">Phone</dt>
                        <dd className="mt-0.5 text-aubergine-900">{voucher.purchaserPhone ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-mauve-400 uppercase">Emailed to</dt>
                        <dd className="mt-0.5 text-aubergine-900">
                          {voucher.recipientEmail
                            ? voucher.emailedAt
                              ? `${voucher.recipientEmail} (sent)`
                              : `${voucher.recipientEmail} (not sent yet)`
                            : 'Not emailed'}
                        </dd>
                      </div>
                    </dl>
                    {voucher.note && <p className="text-sm text-mauve-600">{voucher.note}</p>}

                    <div>
                      <h3 className="text-xs text-gilt-600 uppercase">Ledger</h3>
                      <ul className="mt-2 space-y-1.5">
                        {voucher.transactions.map((entry) => (
                          <li key={entry.id} className="flex items-center gap-3 text-xs">
                            <span className="w-20 shrink-0 text-mauve-400">{dateLabel(entry.createdAt)}</span>
                            <span className="min-w-0 flex-1 truncate text-mauve-600">
                              {entry.kind}
                              {entry.serviceName ? ` · ${entry.serviceName}` : ''}
                              {entry.reason ? ` · ${entry.reason}` : ''}
                            </span>
                            <span className="tabular shrink-0 font-medium text-aubergine-900">
                              {entry.amountCents >= 0 ? '+' : ''}
                              {formatZar(entry.amountCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {flash[voucher.id] && (
                      <p
                        role="status"
                        className={`rounded-lg px-3 py-2 text-xs ${
                          flash[voucher.id]!.ok
                            ? 'bg-sage-500/15 text-sage-600'
                            : 'bg-lacquer-500/10 text-lacquer-600'
                        }`}
                      >
                        {flash[voucher.id]!.text}
                      </p>
                    )}

                    {voucher.status === 'active' && (
                      <VoucherControls
                        voucherId={voucher.id}
                        recipientEmail={voucher.recipientEmail}
                        pending={pending}
                        onAdjust={(amountCents, reason) =>
                          run(voucher.id, () => adjustVoucherAction({ voucherId: voucher.id, amountCents, reason }))
                        }
                        onVoid={(reason) => run(voucher.id, () => voidVoucherAction({ voucherId: voucher.id, reason }))}
                        onResend={(email) =>
                          run(voucher.id, () => resendVoucherEmailAction({ voucherId: voucher.id, recipientEmail: email }))
                        }
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function IssueForm({
  pending,
  onIssue,
  feedback,
  lastIssued,
}: {
  pending: boolean;
  onIssue: (input: Parameters<typeof issueVoucherAction>[0]) => void;
  feedback?: { ok: boolean; text: string };
  lastIssued: { code: string; lookupToken: string } | null;
}) {
  const [amount, setAmount] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserPhone, setPurchaserPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [neverExpires, setNeverExpires] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const rand = Number(amount);
    if (!Number.isFinite(rand) || rand <= 0) return;
    onIssue({
      amountRand: rand,
      purchaserName: purchaserName || undefined,
      purchaserPhone: purchaserPhone || undefined,
      recipientEmail: recipientEmail || undefined,
      expiresAt: expiresAt || undefined,
      neverExpires,
      note: note || undefined,
    });
    setAmount('');
    setPurchaserName('');
    setPurchaserPhone('');
    setRecipientEmail('');
    setExpiresAt('');
    setNeverExpires(false);
    setNote('');
  }

  return (
    <section className="mt-8 rounded-2xl border border-blush-200 bg-white px-5 py-5">
      <h2 className="font-display text-lg font-semibold text-aubergine-900">Issue a voucher</h2>
      <p className="mt-1 text-sm text-mauve-500">
        Take payment the way you already do, then record it here. The card is what matters — email
        is optional, and only sent if mail is configured.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label htmlFor="v-amount" className="block text-sm text-aubergine-900">
            Value (rand)
          </label>
          <input
            id="v-amount"
            type="number"
            min={1}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Purchaser name" value={purchaserName} onChange={setPurchaserName} placeholder="Optional" />
          <TextField
            label="Purchaser phone"
            value={purchaserPhone}
            onChange={setPurchaserPhone}
            placeholder="Optional"
          />
        </div>

        <TextField
          label="Email the code to"
          type="email"
          value={recipientEmail}
          onChange={setRecipientEmail}
          placeholder="Optional — whoever the code is for"
        />

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="v-expires" className="block text-sm text-aubergine-900">
              Expires
            </label>
            <input
              id="v-expires"
              type="date"
              disabled={neverExpires}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none disabled:opacity-50"
            />
          </div>
          <label className="mb-3.5 flex items-center gap-2 text-sm text-mauve-600">
            <input
              type="checkbox"
              checked={neverExpires}
              onChange={(event) => setNeverExpires(event.target.checked)}
            />
            Never expires
          </label>
        </div>
        <p className="text-xs text-mauve-400">
          Leave blank for three years from today — the legal minimum. You may extend it, not
          shorten it.
        </p>

        <TextField label="Note" value={note} onChange={setNote} placeholder="Optional" />

        {feedback && (
          <p
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              feedback.ok ? 'bg-sage-500/15 text-sage-600' : 'bg-lacquer-500/10 text-lacquer-600'
            }`}
          >
            {feedback.text}
          </p>
        )}

        {lastIssued && (
          <div className="rounded-xl bg-blush-100 px-4 py-3 text-center">
            <p className="text-xs text-mauve-500">Write this on the card</p>
            <p className="mt-1 font-mono text-2xl tracking-[0.15em] text-aubergine-900">{lastIssued.code}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-lacquer-500 px-6 py-3.5 text-base font-medium text-blush-50 hover:bg-lacquer-600 disabled:opacity-60"
        >
          {pending ? 'Issuing…' : 'Issue voucher'}
        </button>
      </form>
    </section>
  );
}

function VoucherControls({
  voucherId,
  recipientEmail,
  pending,
  onAdjust,
  onVoid,
  onResend,
}: {
  voucherId: string;
  recipientEmail: string | null;
  pending: boolean;
  onAdjust: (amountCents: number, reason: string) => void;
  onVoid: (reason: string) => void;
  onResend: (email: string) => void;
}) {
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [resendEmail, setResendEmail] = useState(recipientEmail ?? '');

  return (
    <div className="flex flex-wrap gap-2 border-t border-blush-100 pt-3" id={`voucher-${voucherId}`}>
      <button
        type="button"
        onClick={() => setShowAdjust((v) => !v)}
        className="rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100"
      >
        Adjust
      </button>
      <button
        type="button"
        onClick={() => setShowVoid((v) => !v)}
        className="rounded-full border border-blush-300 px-3.5 py-2 text-xs text-lacquer-600 hover:bg-lacquer-500/10"
      >
        Void
      </button>

      {showAdjust && (
        <div className="mt-1 flex w-full flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-mauve-500">Amount (rand, +/-)</label>
            <input
              type="number"
              step={1}
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              className="mt-1 w-28 rounded-lg border border-blush-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-mauve-500">Reason (required)</label>
            <input
              type="text"
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-blush-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending || !adjustReason.trim() || !Number(adjustAmount)}
            onClick={() => {
              onAdjust(Math.round(Number(adjustAmount)) * 100, adjustReason);
              setShowAdjust(false);
              setAdjustAmount('');
              setAdjustReason('');
            }}
            className="rounded-full bg-aubergine-900 px-3.5 py-2 text-xs text-blush-50 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {showVoid && (
        <div className="mt-1 flex w-full flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-mauve-500">Reason (required)</label>
            <input
              type="text"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-blush-300 px-2.5 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending || !voidReason.trim()}
            onClick={() => {
              if (confirm('Void this voucher? This cannot be undone.')) {
                onVoid(voidReason);
                setShowVoid(false);
                setVoidReason('');
              }
            }}
            className="rounded-full bg-lacquer-500 px-3.5 py-2 text-xs text-blush-50 disabled:opacity-50"
          >
            Confirm void
          </button>
        </div>
      )}

      <div className="mt-1 flex w-full flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-mauve-500">Resend to</label>
          <input
            type="email"
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-blush-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={pending || !resendEmail.trim()}
          onClick={() => onResend(resendEmail)}
          className="rounded-full border border-blush-300 px-3.5 py-2 text-xs hover:bg-blush-100 disabled:opacity-50"
        >
          Resend email
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = `v-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-aubergine-900">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-blush-300 bg-white px-4 py-3 text-base focus:border-aubergine-900 focus:outline-none"
        {...rest}
      />
    </div>
  );
}

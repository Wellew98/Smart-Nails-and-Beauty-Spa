import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getVoucherByLookupToken, type VoucherLedgerEntry } from '@/lib/vouchers';
import { consumeVoucherLookup, voucherLookupIp } from '@/lib/voucher-rate-limit';
import { getBusiness } from '@/lib/public-data';
import { formatZar } from '@/lib/money';
import { formatDateLabel } from '@/lib/time';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';

/**
 * `/v/[token]` — the customer's own read-only balance page. Spec §0 and §6.2:
 * no login, the long `lookup_token` is the whole credential, same trust model
 * as `/b/[token]`. Keep this page out of search results and never prerender
 * it — the token is a bearer secret in the URL.
 */
export const metadata: Metadata = {
  title: 'Your voucher',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

function lineLabel(entry: VoucherLedgerEntry): string {
  switch (entry.kind) {
    case 'issue':
      return 'Issued';
    case 'redeem':
      return entry.service_name ?? 'Redeemed at the counter';
    case 'refund':
      return entry.service_name ? `Refunded · ${entry.service_name}` : 'Refunded';
    case 'adjust':
      return entry.reason ?? 'Adjustment';
    case 'void':
      return entry.reason ?? 'Voided';
    default:
      return entry.kind;
  }
}

function signedZar(cents: number): string {
  return cents >= 0 ? `+${formatZar(cents)}` : formatZar(cents);
}

export default async function VoucherPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // §6.2: the rate limit is applied BEFORE the lookup, and a limited request
  // gets the exact same "not found" a bad token gets — no hint that a limit,
  // rather than a wrong token, is why.
  const ip = voucherLookupIp(await headers());
  const allowed = await consumeVoucherLookup(ip);
  if (!allowed) notFound();

  const voucher = await getVoucherByLookupToken(token);
  if (!voucher) notFound();

  const business = await getBusiness();
  const tz = business?.timezone ?? 'Africa/Johannesburg';

  return (
    <div className="mx-auto max-w-lg px-5 pt-14 pb-16 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Gift voucher</p>
      <h1 className="font-display mt-4 text-3xl font-semibold text-aubergine-900 sm:text-4xl">
        {voucher.status === 'void' ? 'This voucher has been voided' : 'Your balance'}
      </h1>

      <div className="mt-8 rounded-2xl border border-blush-200 bg-white px-6 py-7 text-center">
        <p className="tabular font-display text-5xl font-semibold text-aubergine-900">
          {formatZar(voucher.balance_cents)}
        </p>
        <p className="mt-2 text-sm text-mauve-500">
          of {formatZar(voucher.initial_cents)} issued
        </p>
        <p className="mt-4 font-mono text-lg tracking-[0.15em] text-mauve-600">{voucher.code}</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl border border-blush-200 px-4 py-3">
          <dt className="text-xs text-mauve-400 uppercase">Issued</dt>
          <dd className="mt-1 text-aubergine-900">{formatDateLabel(dateOnly(voucher.issued_at), tz)}</dd>
        </div>
        <div className="rounded-xl border border-blush-200 px-4 py-3">
          <dt className="text-xs text-mauve-400 uppercase">Expires</dt>
          <dd className="mt-1 text-aubergine-900">
            {voucher.expires_at ? formatDateLabel(dateOnly(voucher.expires_at), tz) : 'Never'}
          </dd>
        </div>
      </dl>

      {voucher.expired && voucher.status !== 'void' && (
        <p className="mt-4 rounded-xl bg-lacquer-500/10 px-4 py-3 text-sm text-lacquer-600">
          This voucher expired on {formatDateLabel(dateOnly(voucher.expires_at!), tz)}.
        </p>
      )}

      <p className="mt-6 text-sm leading-relaxed text-mauve-600">
        This voucher can be given to someone else, and used across more than one visit — it is
        not tied to who bought it.
      </p>

      <h2 className="font-display mt-10 text-lg font-semibold text-aubergine-900">History</h2>
      <ul className="mt-4 space-y-2">
        {voucher.transactions.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-xl border border-blush-200 px-4 py-3 text-sm"
          >
            <span className="w-24 shrink-0 text-xs text-mauve-400">
              {formatDateLabel(dateOnly(entry.created_at), tz)}
            </span>
            <span className="min-w-0 flex-1 truncate text-mauve-600">{lineLabel(entry)}</span>
            <span className="tabular shrink-0 font-medium text-aubergine-900">
              {signedZar(entry.amount_cents)}
            </span>
          </li>
        ))}
      </ul>

      {business && (
        <div className="mt-14 border-t border-gilt-200/70 pt-6">
          <p className="text-xs text-mauve-400">Questions about this voucher</p>
          <p className="mt-2 text-sm text-mauve-600">{business.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href={`tel:${business.phone}`} className="text-lacquer-500 underline underline-offset-4">
              {formatPhoneForDisplay(business.phone)}
            </a>
            {business.whatsapp && (
              <a
                href={whatsappLink(business.whatsapp, 'Hi, a question about my voucher.')}
                className="text-lacquer-500 underline underline-offset-4"
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      <Link
        href="/book"
        className="mt-8 inline-block rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
      >
        Book a treatment
      </Link>
    </div>
  );
}

/** formatDateLabel wants a calendar date; these columns are timestamptz. */
function dateOnly(instant: Date): string {
  return new Date(instant).toISOString().slice(0, 10);
}

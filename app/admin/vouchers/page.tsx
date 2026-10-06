import { VouchersManager } from '@/components/admin/vouchers-manager';
import { getVoucherDetail, listVouchers, outstandingLiability } from '@/lib/vouchers';
import { requireOwner } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/**
 * §4 — issue, list, and per-voucher detail (ledger, adjust, void, resend).
 * The Today-screen "Pay with voucher" flow lives on `/admin` and
 * `/admin/walk-in` instead — see components/admin/voucher-redeem.tsx — this
 * screen is the one she opens far less often, to issue a card or check a
 * dispute.
 */
export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { businessId } = await requireOwner();
  const params = await searchParams;
  const showAll = params.all === '1';

  const [summaries, liabilityCents] = await Promise.all([
    listVouchers(businessId, { all: showAll }),
    outstandingLiability(businessId),
  ]);

  // A handful of vouchers ever exist for a salon this size, and the default
  // view is only the live ones — fetching the ledger per row here keeps
  // lib/vouchers.ts's summary/detail split clean rather than growing a third,
  // wider query just for this screen.
  const details = await Promise.all(summaries.map((summary) => getVoucherDetail(businessId, summary.id)));

  return (
    <VouchersManager
      showAll={showAll}
      liabilityCents={liabilityCents}
      vouchers={details
        .filter((voucher) => voucher !== null)
        .map((voucher) => ({
          id: voucher.id,
          code: voucher.code,
          purchaserName: voucher.purchaser_name,
          purchaserPhone: voucher.purchaser_phone,
          initialCents: voucher.initial_cents,
          balanceCents: voucher.balance_cents,
          status: voucher.status,
          expired: voucher.expired,
          issuedAt: new Date(voucher.issued_at).toISOString(),
          expiresAt: voucher.expires_at ? new Date(voucher.expires_at).toISOString() : null,
          recipientEmail: voucher.recipient_email,
          emailedAt: voucher.emailed_at ? new Date(voucher.emailed_at).toISOString() : null,
          note: voucher.note,
          transactions: voucher.transactions.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            amountCents: entry.amount_cents,
            reason: entry.reason,
            serviceName: entry.service_name,
            createdAt: new Date(entry.created_at).toISOString(),
          })),
        }))}
    />
  );
}

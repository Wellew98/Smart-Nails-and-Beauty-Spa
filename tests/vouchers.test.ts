import { beforeEach, describe, expect, it } from 'vitest';
import { cancelBooking, createBooking } from '@/lib/booking';
import { query, queryOne } from '@/lib/db';
import { sendVoucherIssued } from '@/lib/email';
import { formatZar } from '@/lib/money';
import {
  adjustVoucher,
  getVoucherByCode,
  getVoucherByLookupToken,
  issueVoucher,
  redeemVoucher,
  voidVoucher,
} from '@/lib/vouchers';
import { IDS, at, nextWorkingDate, resetDatabase } from './helpers/fixtures';

/**
 * spa-voucher-build-spec.md §8 — the eleven acceptance tests, real Postgres,
 * no mocks. §8 says tests 1, 2, 8 and 10 "are the four that decide whether
 * this is done" — test 8 (RLS) lives in tests/rls.test.ts, same class as the
 * original acceptance test 8 there.
 */

beforeEach(resetDatabase);

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };

// ---------------------------------------------------------------------------
describe('§8.1 Concurrency — the test that matters most', () => {
  it('lets exactly 7 of 10 simultaneous R100 redemptions succeed against a R700 voucher, ten runs in a row', async () => {
    for (let run = 1; run <= 10; run++) {
      await resetDatabase();
      const issued = await issueVoucher({ businessId: IDS.business, initialCents: 70000 });
      if (!issued.ok) throw new Error('setup failed');
      const code = issued.voucher.code;

      // All 10 aim at the same voucher at once, in flight together.
      const attempts = Array.from({ length: 10 }, () =>
        redeemVoucher({ businessId: IDS.business, code, amountCents: 10000 }),
      );
      const results = await Promise.all(attempts);
      const won = results.filter((r) => r.ok);
      const lost = results.filter((r) => !r.ok);

      expect(won, `run ${run}: expected exactly 7 winners`).toHaveLength(7);
      expect(lost, `run ${run}: expected 3 losers`).toHaveLength(3);
      for (const failure of lost) {
        expect(failure.ok).toBe(false);
        if (!failure.ok) expect(failure.error).toBe('insufficient_balance');
      }

      // The assertion that actually matters: ask the database, not the app.
      // The balance is never negative at any point — the CHECK constraint is
      // the authority, and the final value proves it held under contention.
      const row = await queryOne<{ balance_cents: number }>(
        'select balance_cents from vouchers where id = $1',
        [issued.voucher.id],
      );
      expect(row!.balance_cents).toBe(0);
    }
  });

  it('allows concurrent redemptions on genuinely different vouchers to all succeed', async () => {
    const vouchers = await Promise.all(
      [0, 1, 2].map(() => issueVoucher({ businessId: IDS.business, initialCents: 50000 })),
    );
    const results = await Promise.all(
      vouchers.map((v) => {
        if (!v.ok) throw new Error('setup failed');
        return redeemVoucher({ businessId: IDS.business, code: v.voucher.code, amountCents: 10000 });
      }),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
describe('§8.2 Ledger invariant', () => {
  it('keeps balance_cents equal to the sum of its ledger after issue, redeem, refund and adjust', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 100000 });
    if (!issued.ok) throw new Error('setup failed');
    const voucherId = issued.voucher.id;

    const date = nextWorkingDate();
    const booking = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booking.ok) throw new Error('setup failed');

    await redeemVoucher({
      businessId: IDS.business,
      code: issued.voucher.code,
      amountCents: 25000,
      appointmentId: booking.appointment.id,
    });
    // A refund, via the real cancellation path (§3).
    await cancelBooking({ appointmentId: booking.appointment.id, actor: 'admin' });
    // An adjustment, both directions.
    await adjustVoucher({ businessId: IDS.business, voucherId, amountCents: -10000, reason: 'goodwill correction' });
    await adjustVoucher({ businessId: IDS.business, voucherId, amountCents: 5000, reason: 'correction reversed' });

    const voucherRow = await queryOne<{ balance_cents: number }>(
      'select balance_cents from vouchers where id = $1',
      [voucherId],
    );
    const sumRow = await queryOne<{ total: string }>(
      "select coalesce(sum(amount_cents),0)::text as total from voucher_transactions where voucher_id = $1",
      [voucherId],
    );
    expect(voucherRow!.balance_cents).toBe(Number(sumRow!.total));
  });
});

// ---------------------------------------------------------------------------
describe('§8.3 Expiry', () => {
  it('refuses redemption one second past expiry, allows it one second before, and never expires when null', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');
    const code = issued.voucher.code;

    // Set directly: issueVoucher enforces the §5 three-year floor on new
    // issues, which this test's near-term expiry would violate — the floor
    // is an issuance-time business rule, not a database constraint, and this
    // test is about redemption behaviour relative to whatever expires_at
    // already holds.
    const expiresAt = at(nextWorkingDate(), '10:00');
    await query('update vouchers set expires_at = $2 where id = $1', [issued.voucher.id, expiresAt.toISOString()]);

    const before = await redeemVoucher({
      businessId: IDS.business,
      code,
      amountCents: 1000,
      now: new Date(expiresAt.getTime() - 1000),
    });
    expect(before.ok).toBe(true);

    const afterExpiry = await redeemVoucher({
      businessId: IDS.business,
      code,
      amountCents: 1000,
      now: new Date(expiresAt.getTime() + 1000),
    });
    expect(afterExpiry.ok).toBe(false);
    if (!afterExpiry.ok) expect(afterExpiry.error).toBe('expired');

    const neverExpiring = await issueVoucher({ businessId: IDS.business, initialCents: 50000, expiresAt: null });
    if (!neverExpiring.ok) throw new Error('setup failed');
    const farFuture = await redeemVoucher({
      businessId: IDS.business,
      code: neverExpiring.voucher.code,
      amountCents: 1000,
      now: new Date('2099-01-01T00:00:00Z'),
    });
    expect(farFuture.ok).toBe(true);
  });

  it('defaults new issues to three years out, and refuses an explicit expiry earlier than that', async () => {
    const now = at(nextWorkingDate(), '10:00');
    const defaulted = await issueVoucher({ businessId: IDS.business, initialCents: 50000, now });
    if (!defaulted.ok) throw new Error('setup failed');
    const expected = new Date(now.getTime());
    expected.setUTCFullYear(expected.getUTCFullYear() + 3);
    expect(new Date(defaulted.voucher.expires_at!).getTime()).toBe(expected.getTime());

    const tooSoon = await issueVoucher({
      businessId: IDS.business,
      initialCents: 50000,
      now,
      expiresAt: new Date(now.getTime() + 86_400_000), // one day out
    });
    expect(tooSoon.ok).toBe(false);
    if (tooSoon.ok) return;
    expect(tooSoon.error).toBe('invalid_expiry');
  });
});

// ---------------------------------------------------------------------------
describe('§8.4 Void', () => {
  it('refuses redemption on a voided voucher, and records the void as a ledger row rather than mutating history', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');
    const voucherId = issued.voucher.id;

    const voided = await voidVoucher({ businessId: IDS.business, voucherId, reason: 'card reported lost' });
    expect(voided.ok).toBe(true);
    if (!voided.ok) return;
    expect(voided.voucher.status).toBe('void');
    expect(voided.voucher.balance_cents).toBe(0);

    const redeemed = await redeemVoucher({ businessId: IDS.business, code: issued.voucher.code, amountCents: 1000 });
    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) expect(redeemed.error).toBe('void');

    const rows = await query<{ kind: string; amount_cents: number }>(
      'select kind, amount_cents from voucher_transactions where voucher_id = $1 order by created_at',
      [voucherId],
    );
    expect(rows).toEqual([
      { kind: 'issue', amount_cents: 50000 },
      { kind: 'void', amount_cents: -50000 },
    ]);
  });

  it('requires a reason to void, exactly as adjust does', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');

    const result = await voidVoucher({ businessId: IDS.business, voucherId: issued.voucher.id, reason: '  ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('reason_required');
  });
});

// ---------------------------------------------------------------------------
describe('§8.5 Over-redemption', () => {
  it('refuses R900 against a R700 balance and names the shortfall', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 70000 });
    if (!issued.ok) throw new Error('setup failed');

    const result = await redeemVoucher({ businessId: IDS.business, code: issued.voucher.code, amountCents: 90000 });
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== 'insufficient_balance') throw new Error('expected insufficient_balance');
    expect(result.shortfallCents).toBe(20000);
    expect(result.message).toContain(formatZar(20000));
    expect(result.message).toContain(formatZar(70000));
  });
});

// ---------------------------------------------------------------------------
describe('§8.6 Cancellation refund', () => {
  it('restores the exact redeemed amount on cancellation, once even if cancelled twice', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 70000 });
    if (!issued.ok) throw new Error('setup failed');

    const date = nextWorkingDate();
    const booking = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booking.ok) throw new Error('setup failed');

    const redeemed = await redeemVoucher({
      businessId: IDS.business,
      code: issued.voucher.code,
      amountCents: 25000,
      appointmentId: booking.appointment.id,
    });
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) return;
    expect(redeemed.voucher.balance_cents).toBe(45000);

    const cancelled = await cancelBooking({ appointmentId: booking.appointment.id, actor: 'admin' });
    expect(cancelled.ok).toBe(true);

    const afterFirstCancel = await queryOne<{ balance_cents: number }>(
      'select balance_cents from vouchers where id = $1',
      [issued.voucher.id],
    );
    expect(afterFirstCancel!.balance_cents).toBe(70000);

    // Cancelling an already-cancelled appointment is refused at the
    // appointment level — the unique index on voucher_transactions is the
    // second, independent backstop against the same double-refund.
    const secondCancel = await cancelBooking({ appointmentId: booking.appointment.id, actor: 'admin' });
    expect(secondCancel.ok).toBe(false);

    const afterSecondCancel = await queryOne<{ balance_cents: number }>(
      'select balance_cents from vouchers where id = $1',
      [issued.voucher.id],
    );
    expect(afterSecondCancel!.balance_cents).toBe(70000);

    const refundRows = await query(
      "select 1 from voucher_transactions where voucher_id = $1 and kind = 'refund'",
      [issued.voucher.id],
    );
    expect(refundRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('§8.7 Cross-tenant', () => {
  it('returns not_found for a code belonging to another business, never that business\'s voucher', async () => {
    const other = '00000000-0000-4000-8000-0000000000b2';
    await query(
      `insert into businesses (id, name, slug, phone) values ($1, 'Rival Spa', 'rival-spa', '+27820000000')`,
      [other],
    );

    const issued = await issueVoucher({ businessId: other, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');

    expect(await getVoucherByCode(IDS.business, issued.voucher.code)).toBeNull();

    const redeemed = await redeemVoucher({ businessId: IDS.business, code: issued.voucher.code, amountCents: 1000 });
    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) expect(redeemed.error).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// §8.8 RLS — see tests/rls.test.ts, "cannot read vouchers or voucher_transactions".
// ---------------------------------------------------------------------------

describe('§8.9 Code normalisation', () => {
  it('resolves the same voucher for 4k2p9x, 4K2-P9X and 4k2-p9x style variants', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');
    const raw = issued.voucher.code_lookup;
    const printed = issued.voucher.code;

    for (const variant of [raw.toLowerCase(), printed, printed.toLowerCase(), raw]) {
      const found = await getVoucherByCode(IDS.business, variant);
      expect(found?.id, `variant "${variant}"`).toBe(issued.voucher.id);
    }
  });
});

// ---------------------------------------------------------------------------
describe('§8.10 The short code is not a public route', () => {
  it('never resolves a voucher by its short code through the lookup_token path /v/[token] uses', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');

    expect(await getVoucherByLookupToken(issued.voucher.code)).toBeNull();
    expect(await getVoucherByLookupToken(issued.voucher.code_lookup)).toBeNull();
    expect(await getVoucherByLookupToken(issued.voucher.lookup_token)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('§8.11 Issue survives a dead mailer', () => {
  it('commits the voucher and returns the code regardless of mail, leaving emailed_at null', async () => {
    // lib/vouchers.ts never sends email at all — dispatch is the CALLER's
    // job, through after(), exactly so a mail outage can never roll back
    // money that has already been taken (§6.1, §10). This is the structural
    // guarantee behind "the issue screen must show whether the email
    // actually went, based on emailed_at — not assume it did."
    const issued = await issueVoucher({
      businessId: IDS.business,
      initialCents: 50000,
      recipientEmail: 'thandi@example.com',
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.voucher.emailed_at).toBeNull();

    const row = await queryOne<{ balance_cents: number }>(
      'select balance_cents from vouchers where id = $1',
      [issued.voucher.id],
    );
    expect(row!.balance_cents).toBe(50000);
  });

  it('sendVoucherIssued fails closed — returns false, never throws — when no mailer is configured', async () => {
    await expect(
      sendVoucherIssued({
        voucherId: 'test-voucher',
        code: '4K2-P9X',
        initialCents: 50000,
        expiresAt: null,
        lookupToken: 'token',
        recipientEmail: 'thandi@example.com',
        businessName: 'Smart Nails and Beauty Spa',
        businessPhone: '+27810444429',
        businessAddress: null,
      }),
    ).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A few cheap extras beyond §8's numbered list, covering rules the spec
// states as flatly as the numbered ones.
// ---------------------------------------------------------------------------
describe('extras', () => {
  it('refuses redeeming the same voucher twice against the same appointment', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');

    const date = nextWorkingDate();
    const booking = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booking.ok) throw new Error('setup failed');

    const first = await redeemVoucher({
      businessId: IDS.business,
      code: issued.voucher.code,
      amountCents: 10000,
      appointmentId: booking.appointment.id,
    });
    expect(first.ok).toBe(true);

    const second = await redeemVoucher({
      businessId: IDS.business,
      code: issued.voucher.code,
      amountCents: 10000,
      appointmentId: booking.appointment.id,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_redeemed');
  });

  it('adjust requires a reason and respects the balance bounds', async () => {
    const issued = await issueVoucher({ businessId: IDS.business, initialCents: 50000 });
    if (!issued.ok) throw new Error('setup failed');

    const noReason = await adjustVoucher({
      businessId: IDS.business,
      voucherId: issued.voucher.id,
      amountCents: 1000,
      reason: '',
    });
    expect(noReason.ok).toBe(false);

    const overTop = await adjustVoucher({
      businessId: IDS.business,
      voucherId: issued.voucher.id,
      amountCents: 100000,
      reason: 'too generous',
    });
    expect(overTop.ok).toBe(false);
    if (!overTop.ok) expect(overTop.error).toBe('out_of_bounds');

    const belowZero = await adjustVoucher({
      businessId: IDS.business,
      voucherId: issued.voucher.id,
      amountCents: -100000,
      reason: 'too harsh',
    });
    expect(belowZero.ok).toBe(false);
    if (!belowZero.ok) expect(belowZero.error).toBe('out_of_bounds');
  });
});

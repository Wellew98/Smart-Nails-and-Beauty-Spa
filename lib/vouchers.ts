import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  isCheckViolation,
  isUniqueViolation,
  lockBusinessForWrite,
  query,
  queryOne,
  withTransaction,
} from './db';
import { formatZar } from './money';
import { tryNormalisePhone } from './phone';
import type { Queryable, Voucher, VoucherTransaction } from './types';

/**
 * spa-voucher-build-spec.md — Phase A. Rand-credit gift vouchers, paid for and
 * redeemed in the salon, never online. No customer login (§0): the code and
 * the long `lookup_token` are bearer credentials, the same shape as
 * `appointments.manage_token`.
 *
 * Every write here takes the SAME advisory lock `lib/booking.ts` uses
 * (`lockBusinessForWrite` in `lib/db.ts`), deliberately, so a cancellation
 * that touches both an appointment and a voucher never has two lock
 * namespaces to order (§3). Voucher volume in a two-therapist salon is a
 * handful a day — there is no contention to optimise for.
 */

// ---------------------------------------------------------------------------
// Codes and tokens — §2.1
// ---------------------------------------------------------------------------

/** No 0/O, no 1/I/L — read over the phone and written on a card by hand. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/** Uniform over CODE_ALPHABET via rejection sampling — plain `% length` on a
 * random byte is very slightly biased toward the low end of the alphabet. */
function randomCodeChars(): string {
  const reject = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < CODE_LENGTH) {
    const byte = randomBytes(1)[0];
    if (byte >= reject) continue;
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

/** '4K2P9X' -> '4K2-P9X', for printing on the card. */
function formatCode(raw: string): string {
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/**
 * `4k2p9x`, `4K2-P9X` and `4k2-p9x` all resolve the same voucher — every
 * lookup goes through this. Acceptance test 9.
 */
function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Same shape as `appointments.manage_token`: 32 random bytes, url-safe. */
function generateLookupToken(): string {
  return randomBytes(32).toString('base64url');
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

// ---------------------------------------------------------------------------
// Internal control-flow errors — translated to results outside the
// transaction, never retried. Same pattern as SlotUnavailable in booking.ts.
// ---------------------------------------------------------------------------

class VoucherNotFound extends Error {
  constructor() {
    super('voucher_not_found');
  }
}
class VoucherVoid extends Error {
  constructor() {
    super('voucher_void');
  }
}
class VoucherExpired extends Error {
  constructor() {
    super('voucher_expired');
  }
}
class AlreadyRedeemed extends Error {
  constructor() {
    super('voucher_already_redeemed');
  }
}
class InsufficientBalance extends Error {
  constructor(public readonly balanceCents: number) {
    super('voucher_insufficient_balance');
  }
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export interface IssueVoucherInput {
  businessId: string;
  initialCents: number;
  purchaserName?: string | null;
  purchaserPhone?: string | null;
  /** Whose inbox the code is emailed to — not necessarily the purchaser's. */
  recipientEmail?: string | null;
  /** Omit for the §5 default (3 years from issue). Null = never expires. */
  expiresAt?: Date | null;
  note?: string | null;
  actor?: string;
  now?: Date;
}

export type IssueVoucherResult =
  | { ok: true; voucher: Voucher }
  | { ok: false; error: 'invalid_amount' | 'invalid_expiry'; message: string };

/**
 * Retry-on-collision, inside the open transaction, via a SAVEPOINT.
 *
 * The spec is explicit: "generate server-side, retry on unique violation
 * rather than pre-checking — the constraint is the authority, as everywhere
 * else here." A plain try/catch around the INSERT is not enough to do that
 * safely: Postgres aborts the WHOLE transaction on any failed statement, so
 * without a savepoint the very first collision would also take down the
 * `issue` ledger row this function's caller writes next. The savepoint scopes
 * the abort to just this one attempt.
 */
async function insertVoucherRow(
  client: Queryable,
  params: {
    businessId: string;
    initialCents: number;
    expiresAt: Date | null;
    purchaserName: string | null;
    purchaserPhone: string | null;
    recipientEmail: string | null;
    note: string | null;
  },
): Promise<Voucher> {
  const attempts = 8;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const raw = randomCodeChars();
    const code = formatCode(raw);
    const codeLookup = raw;
    const lookupToken = generateLookupToken();

    await client.query('savepoint voucher_code_attempt');
    try {
      const result = await client.query(
        `insert into vouchers (
            business_id, code, code_lookup, lookup_token,
            initial_cents, balance_cents, expires_at,
            purchaser_name, purchaser_phone, recipient_email, note
         ) values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          params.businessId,
          code,
          codeLookup,
          lookupToken,
          params.initialCents,
          params.expiresAt?.toISOString() ?? null,
          params.purchaserName,
          params.purchaserPhone,
          params.recipientEmail,
          params.note,
        ],
      );
      await client.query('release savepoint voucher_code_attempt');
      return result.rows[0] as unknown as Voucher;
    } catch (error) {
      await client.query('rollback to savepoint voucher_code_attempt');
      if (isUniqueViolation(error)) continue; // code_lookup or lookup_token collided
      throw error;
    }
  }
  throw new Error(`Could not generate a unique voucher code after ${attempts} attempts.`);
}

/**
 * Insert the voucher and its opening `issue` ledger entry, one transaction.
 *
 * Deliberately does NOT send the email — spec §6.1: "sending must never fail
 * the issue. The voucher is created and the money is already taken." The
 * caller dispatches `sendVoucherIssued` through `after()`, same as every
 * other transactional email in this codebase.
 */
export async function issueVoucher(input: IssueVoucherInput): Promise<IssueVoucherResult> {
  const {
    businessId,
    initialCents,
    purchaserName = null,
    purchaserPhone = null,
    recipientEmail = null,
    note = null,
    actor = 'admin',
    now = new Date(),
  } = input;

  if (!Number.isInteger(initialCents) || initialCents <= 0) {
    return { ok: false, error: 'invalid_amount', message: 'Enter a voucher value greater than zero.' };
  }

  // §5: three years from issue is the Consumer Protection Act floor, and it
  // cannot be shortened. Null stays null — "never expires" is a valid choice.
  const floor = addYears(now, 3);
  let expiresAt: Date | null;
  if (input.expiresAt === undefined) {
    expiresAt = floor;
  } else if (input.expiresAt === null) {
    expiresAt = null;
  } else if (input.expiresAt.getTime() < floor.getTime()) {
    return {
      ok: false,
      error: 'invalid_expiry',
      message: 'South African law sets three years from issue as the earliest a voucher may expire.',
    };
  } else {
    expiresAt = input.expiresAt;
  }

  // A free-text contact field, not an identity key — fall back to the raw
  // trimmed input rather than rejecting the voucher over an unparsable number.
  const normalisedPhone = purchaserPhone
    ? (tryNormalisePhone(purchaserPhone) ?? purchaserPhone.trim())
    : null;

  const voucher = await withTransaction(async (client) => {
    await lockBusinessForWrite(client, businessId);

    const row = await insertVoucherRow(client, {
      businessId,
      initialCents,
      expiresAt,
      purchaserName: purchaserName?.trim() || null,
      purchaserPhone: normalisedPhone,
      recipientEmail: recipientEmail?.trim() || null,
      note: note?.trim() || null,
    });

    await client.query(
      `insert into voucher_transactions (voucher_id, kind, amount_cents, actor)
            values ($1, 'issue', $2, $3)`,
      [row.id, initialCents, actor],
    );

    return row;
  });

  return { ok: true, voucher };
}

// ---------------------------------------------------------------------------
// Redeem — §3
// ---------------------------------------------------------------------------

export interface RedeemVoucherInput {
  businessId: string;
  code: string;
  amountCents: number;
  /** null for a counter sale not tied to a booking. */
  appointmentId?: string | null;
  reason?: string | null;
  actor?: string;
  now?: Date;
}

export type RedeemVoucherResult =
  | { ok: true; voucher: Voucher; redeemedCents: number }
  | { ok: false; error: 'invalid_amount'; message: string }
  | { ok: false; error: 'not_found'; message: string }
  | { ok: false; error: 'void'; message: string }
  | { ok: false; error: 'expired'; message: string }
  | { ok: false; error: 'already_redeemed'; message: string }
  | { ok: false; error: 'insufficient_balance'; shortfallCents: number; message: string };

/**
 * Take `amountCents` off a voucher, refusing over-redemption by naming the
 * shortfall rather than silently clamping (§3: "she needs to know"). The
 * caller is responsible for never asking for more than the treatment price —
 * "R700 voucher against a R900 treatment" means the caller redeems R700 and
 * takes R200 by other means, it does not redeem R900.
 */
export async function redeemVoucher(input: RedeemVoucherInput): Promise<RedeemVoucherResult> {
  const {
    businessId,
    code,
    amountCents,
    appointmentId = null,
    reason = null,
    actor = 'admin',
    now = new Date(),
  } = input;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'invalid_amount', message: 'Enter an amount to redeem.' };
  }

  const codeLookup = normaliseCode(code);

  try {
    const voucher = await withTransaction(async (client) => {
      await lockBusinessForWrite(client, businessId);

      // Re-read the balance INSIDE the lock, never trust one passed in from
      // the UI (§3) — every other writer for this business queues behind the
      // same lock, so nothing can move it between this read and the update.
      const rows = await client.query(
        'select * from vouchers where business_id = $1 and code_lookup = $2',
        [businessId, codeLookup],
      );
      const row = rows.rows[0] as unknown as Voucher | undefined;
      if (!row) throw new VoucherNotFound();
      if (row.status === 'void') throw new VoucherVoid();
      if (row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) throw new VoucherExpired();
      if (amountCents > row.balance_cents) throw new InsufficientBalance(row.balance_cents);

      // Existence check BEFORE the insert, not a caught unique-violation on
      // it: a failed statement aborts the whole Postgres transaction, and
      // this one has nothing after it to protect, but every OTHER writer in
      // this file that loops (refundVoucherRedemptionsForAppointment) does —
      // same rule applied consistently. The lock already rules out a race
      // between this check and the insert.
      if (appointmentId) {
        const existing = await client.query(
          `select 1 from voucher_transactions
            where voucher_id = $1 and appointment_id = $2 and kind = 'redeem'`,
          [row.id, appointmentId],
        );
        if (existing.rows.length > 0) throw new AlreadyRedeemed();
      }

      const updated = await client.query(
        `update vouchers set balance_cents = balance_cents - $2 where id = $1 returning *`,
        [row.id, amountCents],
      );
      await client.query(
        `insert into voucher_transactions (voucher_id, appointment_id, kind, amount_cents, actor, reason)
              values ($1, $2, 'redeem', $3, $4, $5)`,
        [row.id, appointmentId, -amountCents, actor, reason],
      );

      return updated.rows[0] as unknown as Voucher;
    });

    return { ok: true, voucher, redeemedCents: amountCents };
  } catch (error) {
    if (error instanceof VoucherNotFound) {
      return { ok: false, error: 'not_found', message: 'No voucher with that code.' };
    }
    if (error instanceof VoucherVoid) {
      return { ok: false, error: 'void', message: 'That voucher has been voided.' };
    }
    if (error instanceof VoucherExpired) {
      return { ok: false, error: 'expired', message: 'That voucher has expired.' };
    }
    if (error instanceof AlreadyRedeemed) {
      return {
        ok: false,
        error: 'already_redeemed',
        message: 'This voucher has already been redeemed against this booking.',
      };
    }
    if (error instanceof InsufficientBalance) {
      const shortfallCents = amountCents - error.balanceCents;
      return {
        ok: false,
        error: 'insufficient_balance',
        shortfallCents,
        message: `There's ${formatZar(error.balanceCents)} on this voucher, ${formatZar(shortfallCents)} short of the ${formatZar(amountCents)} requested.`,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Refund on cancellation — §3
// ---------------------------------------------------------------------------

/**
 * Refund every `redeem` entry this appointment has, inside a transaction the
 * CALLER already holds the business lock for — this function takes no lock of
 * its own and issues no statement that can abort the caller's transaction, so
 * it composes safely inside `cancelBooking` and `forgetCustomer` in
 * lib/booking.ts (spec §3: "wire this into cancelBooking, it already holds
 * the business advisory lock, so no new locking").
 *
 * Idempotent by construction: checks for an existing `refund` before writing
 * one, rather than racing the unique index and catching the violation, so a
 * double-cancel is a harmless no-op instead of an aborted transaction — see
 * the note on the same trade-off in `redeemVoucher`.
 */
export async function refundVoucherRedemptionsForAppointment(
  client: Queryable,
  appointmentId: string,
  actor: string,
): Promise<void> {
  const redemptions = await client.query(
    `select voucher_id, amount_cents from voucher_transactions
      where appointment_id = $1 and kind = 'redeem'`,
    [appointmentId],
  );

  for (const redemption of redemptions.rows as unknown as { voucher_id: string; amount_cents: number }[]) {
    const already = await client.query(
      `select 1 from voucher_transactions
        where voucher_id = $1 and appointment_id = $2 and kind = 'refund'`,
      [redemption.voucher_id, appointmentId],
    );
    if (already.rows.length > 0) continue;

    const refundCents = -redemption.amount_cents; // the redeem was negative; this is its mirror
    await client.query(
      `insert into voucher_transactions (voucher_id, appointment_id, kind, amount_cents, actor, reason)
            values ($1, $2, 'refund', $3, $4, 'appointment cancelled')`,
      [redemption.voucher_id, appointmentId, refundCents, actor],
    );
    await client.query('update vouchers set balance_cents = balance_cents + $2 where id = $1', [
      redemption.voucher_id,
      refundCents,
    ]);
  }
}

/** Standalone entry point for a manual refund outside a cancellation flow. */
export async function refundRedemption(options: {
  businessId: string;
  appointmentId: string;
  actor?: string;
}): Promise<void> {
  const { businessId, appointmentId, actor = 'admin' } = options;
  await withTransaction(async (client) => {
    await lockBusinessForWrite(client, businessId);
    await refundVoucherRedemptionsForAppointment(client, appointmentId, actor);
  });
}

// ---------------------------------------------------------------------------
// Adjust and void — owner corrections
// ---------------------------------------------------------------------------

export interface AdjustVoucherInput {
  businessId: string;
  voucherId: string;
  /** Signed: positive tops up, negative takes off. */
  amountCents: number;
  reason: string;
  actor?: string;
}

export type AdjustVoucherResult =
  | { ok: true; voucher: Voucher }
  | { ok: false; error: 'not_found'; message: string }
  | { ok: false; error: 'reason_required'; message: string }
  | { ok: false; error: 'invalid_amount'; message: string }
  | { ok: false; error: 'out_of_bounds'; message: string };

/** Both directions, and a reason is mandatory — spec §4. */
export async function adjustVoucher(input: AdjustVoucherInput): Promise<AdjustVoucherResult> {
  const { businessId, voucherId, amountCents, actor = 'admin' } = input;
  const reason = input.reason?.trim();
  if (!reason) {
    return { ok: false, error: 'reason_required', message: 'A reason is required for any adjustment.' };
  }
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    return { ok: false, error: 'invalid_amount', message: 'Enter a non-zero amount.' };
  }

  try {
    const voucher = await withTransaction(async (client) => {
      await lockBusinessForWrite(client, businessId);

      const rows = await client.query('select 1 from vouchers where id = $1 and business_id = $2', [
        voucherId,
        businessId,
      ]);
      if (rows.rows.length === 0) throw new VoucherNotFound();

      const updated = await client.query(
        `update vouchers set balance_cents = balance_cents + $2 where id = $1 returning *`,
        [voucherId, amountCents],
      );
      await client.query(
        `insert into voucher_transactions (voucher_id, kind, amount_cents, actor, reason)
              values ($1, 'adjust', $2, $3, $4)`,
        [voucherId, amountCents, actor, reason],
      );
      return updated.rows[0] as unknown as Voucher;
    });
    return { ok: true, voucher };
  } catch (error) {
    if (error instanceof VoucherNotFound) {
      return { ok: false, error: 'not_found', message: 'That voucher could not be found.' };
    }
    // The check constraint (0 <= balance <= initial) is the backstop, exactly
    // as HANDOFF §3 argues application-level checks alone cannot be trusted.
    if (isCheckViolation(error)) {
      return {
        ok: false,
        error: 'out_of_bounds',
        message: 'That would take the balance below zero or above the voucher’s original value.',
      };
    }
    throw error;
  }
}

export interface VoidVoucherInput {
  businessId: string;
  voucherId: string;
  reason: string;
  actor?: string;
}

export type VoidVoucherResult =
  | { ok: true; voucher: Voucher }
  | { ok: false; error: 'not_found'; message: string }
  | { ok: false; error: 'reason_required'; message: string };

/**
 * Lost or fraudulent. Writes a `void` ledger row taking the balance to zero —
 * never mutates history — and rotates `lookup_token` so an old `/v/` link
 * stops resolving, the same reasoning as rotating a manage token on erasure.
 */
export async function voidVoucher(input: VoidVoucherInput): Promise<VoidVoucherResult> {
  const { businessId, voucherId, actor = 'admin' } = input;
  const reason = input.reason?.trim();
  if (!reason) {
    return { ok: false, error: 'reason_required', message: 'A reason is required to void a voucher.' };
  }

  try {
    const voucher = await withTransaction(async (client) => {
      await lockBusinessForWrite(client, businessId);

      const rows = await client.query('select * from vouchers where id = $1 and business_id = $2', [
        voucherId,
        businessId,
      ]);
      const row = rows.rows[0] as unknown as Voucher | undefined;
      if (!row) throw new VoucherNotFound();

      await client.query(
        `insert into voucher_transactions (voucher_id, kind, amount_cents, actor, reason)
              values ($1, 'void', $2, $3, $4)`,
        [voucherId, -row.balance_cents, actor, reason],
      );
      const updated = await client.query(
        `update vouchers
            set status = 'void', balance_cents = 0, lookup_token = $2
          where id = $1
          returning *`,
        [voucherId, generateLookupToken()],
      );
      return updated.rows[0] as unknown as Voucher;
    });
    return { ok: true, voucher };
  } catch (error) {
    if (error instanceof VoucherNotFound) {
      return { ok: false, error: 'not_found', message: 'That voucher could not be found.' };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Erasure — spa-voucher-build-spec.md §7, wired into lib/booking.ts's
// forgetCustomer. Same rules as everywhere else in this codebase: anonymise,
// never delete, and never touch the ledger.
// ---------------------------------------------------------------------------

/**
 * Null the purchaser/recipient fields of any voucher matching the erased
 * customer's phone or email, and rotate `lookup_token` so an old emailed link
 * stops resolving. Called from WITHIN `forgetCustomer`'s already-locked
 * transaction — no lock of its own.
 *
 * Leaves everything else alone: `balance_cents` and the whole ledger are the
 * salon's financial record, not the customer's to erase, exactly as an
 * appointment survives with its price and its therapist after the name on it
 * is gone.
 */
export async function eraseVoucherPersonalData(
  client: Queryable,
  options: { businessId: string; phone: string; email: string | null },
): Promise<void> {
  const { businessId, phone, email } = options;

  const rows = await client.query(
    `select id from vouchers
      where business_id = $1
        and (purchaser_phone = $2 or ($3::text is not null and recipient_email = $3))`,
    [businessId, phone, email],
  );

  for (const row of rows.rows as unknown as { id: string }[]) {
    await client.query(
      `update vouchers
          set purchaser_name = null, purchaser_phone = null, recipient_email = null,
              lookup_token = $2
        where id = $1`,
      [row.id, generateLookupToken()],
    );
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export interface VoucherLedgerEntry extends VoucherTransaction {
  appointment_starts_at: Date | null;
  service_name: string | null;
}

export interface VoucherWithLedger extends Voucher {
  expired: boolean;
  transactions: VoucherLedgerEntry[];
}

export interface VoucherSummary extends Voucher {
  expired: boolean;
}

function isExpired(voucher: Voucher, now: Date = new Date()): boolean {
  return voucher.expires_at !== null && new Date(voucher.expires_at).getTime() < now.getTime();
}

async function attachLedger(voucher: Voucher): Promise<VoucherWithLedger> {
  const transactions = await query<VoucherLedgerEntry>(
    `select vt.*, a.starts_at as appointment_starts_at, s.name as service_name
       from voucher_transactions vt
       left join appointments a on a.id = vt.appointment_id
       left join services s on s.id = a.service_id
      where vt.voucher_id = $1
      order by vt.created_at`,
    [voucher.id],
  );
  return { ...voucher, expired: isExpired(voucher), transactions };
}

/**
 * Business-scoped lookup by the SHORT code, for the owner's counter flow.
 * Acceptance test 7: a code belonging to another business returns null here,
 * never another salon's voucher.
 */
export async function getVoucherByCode(businessId: string, rawCode: string): Promise<VoucherWithLedger | null> {
  const codeLookup = normaliseCode(rawCode);
  if (!codeLookup) return null;
  const voucher = await queryOne<Voucher>(
    'select * from vouchers where business_id = $1 and code_lookup = $2',
    [businessId, codeLookup],
  );
  return voucher ? attachLedger(voucher) : null;
}

/**
 * Global lookup by the LONG token, for `/v/[token]` and admin resend. Queries
 * ONLY `lookup_token` — never `code_lookup` — which is what makes acceptance
 * test 10 true: a short code can never resolve through this function, because
 * it is not the column being matched. Do not add a fallback that tries both;
 * see spec §6.2, "the single most important line in this section."
 */
export async function getVoucherByLookupToken(token: string): Promise<VoucherWithLedger | null> {
  const voucher = await queryOne<Voucher>('select * from vouchers where lookup_token = $1', [token]);
  return voucher ? attachLedger(voucher) : null;
}

/**
 * The admin list. Default view is "live" — active, unexpired, still carrying
 * a balance — with everything else (spent, expired, void) behind `all` (§4).
 */
export async function listVouchers(businessId: string, options: { all?: boolean } = {}): Promise<VoucherSummary[]> {
  const rows = await query<Voucher>(
    `select * from vouchers
      where business_id = $1
        and ($2 or (status = 'active' and balance_cents > 0 and (expires_at is null or expires_at > now())))
      order by issued_at desc`,
    [businessId, options.all ?? false],
  );
  const now = new Date();
  return rows.map((row) => ({ ...row, expired: isExpired(row, now) }));
}

/** The per-voucher detail view: full ledger, for the admin expand panel. */
export async function getVoucherDetail(businessId: string, voucherId: string): Promise<VoucherWithLedger | null> {
  const voucher = await queryOne<Voucher>('select * from vouchers where id = $1 and business_id = $2', [
    voucherId,
    businessId,
  ]);
  return voucher ? attachLedger(voucher) : null;
}

/**
 * Money the salon owes in services. Spec §3: "put it on the vouchers admin
 * screen as a single figure." Void and expired vouchers carry no liability.
 */
export async function outstandingLiability(businessId: string): Promise<number> {
  const rows = await query<{ total: string | null }>(
    `select sum(balance_cents)::text as total
       from vouchers
      where business_id = $1
        and status = 'active'
        and (expires_at is null or expires_at > now())`,
    [businessId],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Set once an issue or resend email actually goes out — never assumed. */
export async function markVoucherEmailed(voucherId: string): Promise<void> {
  await query('update vouchers set emailed_at = now() where id = $1', [voucherId]);
}

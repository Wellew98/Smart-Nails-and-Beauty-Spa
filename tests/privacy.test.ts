import { beforeEach, describe, expect, it } from 'vitest';
import {
  ERASED_NAME,
  ERASED_PHONE_PREFIX,
  createBooking,
  forgetCustomer,
  getAppointmentById,
  getAppointmentByToken,
} from '@/lib/booking';
import { getAvailableSlots } from '@/lib/availability';
import { query, queryOne } from '@/lib/db';
import { issueVoucher } from '@/lib/vouchers';
import { IDS, at, labels, nextWorkingDate, resetDatabase } from './helpers/fixtures';

/**
 * Spec §9.4 — "delete my details".
 *
 * The requirement is one sentence: "Anonymise the `customers` row rather than
 * deleting it, so past appointments keep resolving." Almost every way of
 * getting that wrong is silent, so each half is asserted separately: that the
 * person is really gone, AND that the diary is really intact.
 */

beforeEach(resetDatabase);

const customer = { name: 'Thandi Mahlangu', phone: '082 555 0101' };
const E164 = '+27825550101';

async function customerRow(id: string) {
  const rows = await query<{ id: string; name: string; phone: string; email: string | null; notes: string | null }>(
    'select id, name, phone, email, notes from customers where id = $1',
    [id],
  );
  return rows[0] ?? null;
}

describe('§9.4 Erasure', () => {
  it('empties the customer row without deleting it, so past appointments still resolve', async () => {
    // A walk-in, so it can be dated in the past — the owner's path is exempt
    // from minimum notice and from working hours, and this test needs an
    // appointment that has already happened in order to protect it.
    const past = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at('2026-01-14', '10:00'),
      source: 'walkin',
      ...customer,
    });
    if (!past.ok) throw new Error('setup failed');

    const result = await forgetCustomer({ customerId: past.appointment.customer_id });
    expect(result.ok).toBe(true);

    // The person is gone.
    const row = await customerRow(past.appointment.customer_id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe(ERASED_NAME);
    expect(row!.phone.startsWith(ERASED_PHONE_PREFIX)).toBe(true);
    expect(row!.email).toBeNull();

    // Nothing anywhere still holds the real details.
    const survivors = await query(
      'select id from customers where phone = $1 or name = $2',
      [E164, customer.name],
    );
    expect(survivors).toEqual([]);

    // The diary is intact: the appointment still resolves, with its service,
    // therapist, time and the price it was booked at.
    const appointment = await getAppointmentById(past.appointment.id);
    expect(appointment).not.toBeNull();
    expect(appointment!.service_name).toBe('Gel Manicure');
    expect(appointment!.staff_name).toBe('Sarah');
    expect(appointment!.price_cents_at_booking).toBe(past.appointment.price_cents_at_booking);
    expect(appointment!.customer_name).toBe(ERASED_NAME);
  });

  it('cancels bookings still to come and puts the time back on the diary', async () => {
    const date = nextWorkingDate();

    const upcoming = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!upcoming.ok) throw new Error('setup failed');

    const before = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
      staffId: IDS.staff.sarah,
    });
    expect(labels(before)).not.toContain('10:00');

    const result = await forgetCustomer({ customerId: upcoming.appointment.customer_id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Reported back, because the owner has to be told what left her diary.
    expect(result.cancelled).toHaveLength(1);
    expect(result.cancelled[0].id).toBe(upcoming.appointment.id);
    expect(result.cancelled[0].customer_name).toBe(customer.name);

    const after = await getAvailableSlots({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      date,
      staffId: IDS.staff.sarah,
    });
    expect(labels(after)).toContain('10:00');
  });

  it('kills the manage link, so an old email cannot reopen the record', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');
    const token = booked.appointment.manage_token;

    expect(await getAppointmentByToken(token)).not.toBeNull();

    await forgetCustomer({ customerId: booked.appointment.customer_id });

    expect(await getAppointmentByToken(token)).toBeNull();
  });

  it('clears free-text notes on the customer and on her appointments', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      notes: 'Allergic to acetone. Sister on 082 555 0999 if unreachable.',
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await query('update customers set notes = $2 where id = $1', [
      booked.appointment.customer_id,
      'Prefers Sarah. Lives on Amanda Ave.',
    ]);

    await forgetCustomer({ customerId: booked.appointment.customer_id });

    const row = await customerRow(booked.appointment.customer_id);
    expect(row!.notes).toBeNull();

    const appointments = await query<{ notes: string | null }>(
      'select notes from appointments where customer_id = $1',
      [booked.appointment.customer_id],
    );
    expect(appointments.every((a) => a.notes === null)).toBe(true);
  });

  it('lets the same person book again as a new customer, unlinked to the old record', async () => {
    const date = nextWorkingDate();

    const first = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!first.ok) throw new Error('setup failed');

    await forgetCustomer({ customerId: first.appointment.customer_id });

    // The unique (business_id, phone) index no longer holds her real number,
    // so the upsert creates a fresh row rather than resurrecting the old one.
    const second = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '14:00'),
      ...customer,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.appointment.customer_id).not.toBe(first.appointment.customer_id);

    const fresh = await customerRow(second.appointment.customer_id);
    expect(fresh!.name).toBe(customer.name);
    expect(fresh!.phone).toBe(E164);
  });

  it('is idempotent, and a second request erases nothing further', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.fullBodyMassage,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    const first = await forgetCustomer({ customerId: booked.appointment.customer_id });
    expect(first.ok && first.alreadyErased).toBe(false);

    const second = await forgetCustomer({ customerId: booked.appointment.customer_id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyErased).toBe(true);
    expect(second.cancelled).toEqual([]);
  });

  it('audits the erasure without recording who was erased', async () => {
    const date = nextWorkingDate();

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await forgetCustomer({ customerId: booked.appointment.customer_id });

    const events = await query<{ event: string; actor: string; detail: unknown }>(
      "select event, actor, detail from appointment_events where event = 'customer_erased'",
    );
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe('customer');

    // A log that named the person would defeat the request it records.
    const serialised = JSON.stringify(events[0].detail);
    expect(serialised).not.toContain(customer.name);
    expect(serialised).not.toContain(E164);
  });

  it('reports not_found for an unknown customer rather than throwing', async () => {
    const result = await forgetCustomer({
      customerId: '00000000-0000-4000-8000-0000000000ff',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_found');
  });

  /**
   * Vouchers build spec §7 — a new place personal data lives that this
   * erasure path did not know about before lib/vouchers.ts's
   * eraseVoucherPersonalData existed. Two independent matches (purchaser
   * phone, recipient email) and the ledger/balance must survive untouched —
   * that money is the studio's record, not the customer's to erase.
   */
  it('clears a voucher\'s purchaser and recipient details on erasure, and rotates its link, without touching the balance or ledger', async () => {
    const date = nextWorkingDate();

    const purchased = await issueVoucher({
      businessId: IDS.business,
      initialCents: 50000,
      purchaserName: customer.name,
      purchaserPhone: customer.phone,
    });
    if (!purchased.ok) throw new Error('setup failed');
    const originalToken = purchased.voucher.lookup_token;

    // A second voucher, bought BY someone else FOR this customer's email —
    // §7's "recipient_email is frequently a third party's address" case.
    const gifted = await issueVoucher({
      businessId: IDS.business,
      initialCents: 30000,
      purchaserName: 'A Friend',
      recipientEmail: 'thandi@example.com',
    });
    if (!gifted.ok) throw new Error('setup failed');

    const booked = await createBooking({
      businessId: IDS.business,
      serviceId: IDS.service.gelManicure,
      staffId: IDS.staff.sarah,
      startsAt: at(date, '10:00'),
      email: 'thandi@example.com',
      ...customer,
    });
    if (!booked.ok) throw new Error('setup failed');

    await forgetCustomer({ customerId: booked.appointment.customer_id });

    const byPhone = await queryOne<{
      purchaser_name: string | null;
      purchaser_phone: string | null;
      lookup_token: string;
      balance_cents: number;
    }>('select purchaser_name, purchaser_phone, lookup_token, balance_cents from vouchers where id = $1', [
      purchased.voucher.id,
    ]);
    expect(byPhone!.purchaser_name).toBeNull();
    expect(byPhone!.purchaser_phone).toBeNull();
    expect(byPhone!.lookup_token).not.toBe(originalToken);
    expect(byPhone!.balance_cents).toBe(50000); // the money is untouched

    // §7: "null all three on any voucher matching the erased customer's
    // phone or email" — matching on recipient_email clears purchaser_name
    // too, even though "A Friend" is a different person. The spec is
    // explicit about this rather than trying to keep half a record: once
    // the person this voucher was FOR has been forgotten, the whole
    // who-gave-it-to-whom record goes with her.
    const byEmail = await queryOne<{ purchaser_name: string | null; recipient_email: string | null }>(
      'select purchaser_name, recipient_email from vouchers where id = $1',
      [gifted.voucher.id],
    );
    expect(byEmail!.purchaser_name).toBeNull();
    expect(byEmail!.recipient_email).toBeNull();

    // The ledger — the studio's financial record — is exactly as it was.
    const ledger = await query<{ kind: string; amount_cents: number }>(
      'select kind, amount_cents from voucher_transactions where voucher_id = $1',
      [purchased.voucher.id],
    );
    expect(ledger).toEqual([{ kind: 'issue', amount_cents: 50000 }]);
  });
});

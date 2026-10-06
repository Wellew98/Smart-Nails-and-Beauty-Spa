export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type BookingSource = 'web' | 'admin' | 'walkin';

export interface Business {
  id: string;
  name: string;
  slug: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  google_maps_url: string | null;
  gbp_place_id: string | null;
  timezone: string;
  min_notice_minutes: number;
  max_advance_days: number;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  turnaround_minutes: number;
  price_cents: number;
  active: boolean;
  sort_order: number;
}

export interface Staff {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
}

export interface Resource {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
}

export interface WorkingHours {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface AvailabilityBlock {
  id: string;
  staff_id: string | null;
  resource_id: string | null;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

export interface Appointment {
  id: string;
  business_id: string;
  service_id: string;
  staff_id: string;
  resource_id: string | null;
  customer_id: string;
  starts_at: Date;
  ends_at: Date;
  blocks_until: Date;
  status: AppointmentStatus;
  source: BookingSource;
  manage_token: string;
  price_cents_at_booking: number;
  notes: string | null;
  created_at: Date;
  cancelled_at: Date | null;
  idempotency_key: string | null;
  rescheduled_from: string | null;
}

/**
 * A bookable start time. The resolved staff/resource pair travels with it but
 * is NOT sent to the browser — spec §4: "Keep the resolved staff/resource pair
 * server-side." The client sends back only the instant.
 */
export interface Slot {
  startsAt: Date;
  staffId: string;
  resourceId: string | null;
}

/** What the browser receives: a time, and who it would be with. */
export interface PublicSlot {
  startsAt: string; // ISO instant
  label: string; // 'HH:MM' in the business timezone
  staffName: string;
}

/** Anything that can run a query — a Pool or a PoolClient inside a transaction. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------------------------------------------------------------------------
// Vouchers — spa-voucher-build-spec.md §2.
// ---------------------------------------------------------------------------

export type VoucherStatus = 'active' | 'void';
export type VoucherTransactionKind = 'issue' | 'redeem' | 'refund' | 'adjust' | 'void';

export interface Voucher {
  id: string;
  business_id: string;
  code: string;
  code_lookup: string;
  lookup_token: string;
  initial_cents: number;
  balance_cents: number;
  status: VoucherStatus;
  issued_at: Date;
  expires_at: Date | null;
  purchaser_name: string | null;
  purchaser_phone: string | null;
  recipient_email: string | null;
  emailed_at: Date | null;
  note: string | null;
}

export interface VoucherTransaction {
  id: string;
  voucher_id: string;
  appointment_id: string | null;
  kind: VoucherTransactionKind;
  amount_cents: number;
  actor: string;
  reason: string | null;
  created_at: Date;
}

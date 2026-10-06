/**
 * Phone handling. Spec §12: normalise to E.164 on write with default region ZA.
 * Store "+27821234567", display "082 123 4567".
 *
 * The phone number is the customer identity key (§3 customers.unique
 * (business_id, phone)), so a normalisation slip creates duplicate customers
 * rather than a visible error. Everything writing a phone goes through here.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Not a valid South African phone number: ${input}`);
    this.name = 'InvalidPhoneError';
  }
}

/** Returns E.164 ("+27821234567") or throws InvalidPhoneError. */
export function normalisePhone(input: string): string {
  const parsed = parsePhoneNumberFromString(input ?? '', 'ZA');
  if (!parsed || !parsed.isValid()) throw new InvalidPhoneError(input);
  return parsed.number;
}

/** Non-throwing variant for form validation. */
export function tryNormalisePhone(input: string): string | null {
  try {
    return normalisePhone(input);
  } catch {
    return null;
  }
}

/** "+27821234567" -> "082 123 4567". Falls back to the input if unparseable. */
export function formatPhoneForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164 ?? '', 'ZA');
  if (!parsed || !parsed.isValid()) return e164;
  // formatNational() gives "082 123 4567" for ZA.
  return parsed.formatNational();
}

/**
 * wa.me deep link for the owner's Today screen (§7 screen 1).
 * wa.me wants digits only, no "+".
 */
export function whatsappLink(e164: string, message?: string): string {
  const digits = (e164 ?? '').replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

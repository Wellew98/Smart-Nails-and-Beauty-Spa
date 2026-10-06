import { describe, expect, it } from 'vitest';
import { bareAddress, getTransport, selectedTransport, withDisplayName } from '@/lib/mail';

/**
 * The mail transport seam (`lib/mail.ts`).
 *
 * The spa owns no domain yet, so Resend cannot send for it and the provider
 * had to become swappable. These tests hold the two properties that make that
 * swap safe: the right transport is chosen from whatever is configured, and
 * nothing configured is a quiet no-op rather than a crash.
 */

const gmail = { GMAIL_USER: 'spa@gmail.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop' };
const resend = { RESEND_API_KEY: 're_abc', BOOKING_FROM_EMAIL: 'bookings@spa.co.za' };

describe('choosing a transport', () => {
  it('infers gmail, resend, or neither from what is configured', () => {
    expect(selectedTransport(gmail)).toBe('gmail');
    expect(selectedTransport(resend)).toBe('resend');
    expect(selectedTransport({})).toBeNull();
  });

  it('needs BOTH gmail variables before it will pick gmail', () => {
    // Half-configured must not select the transport — it would fail every
    // send at authentication rather than being reported as unconfigured.
    expect(selectedTransport({ GMAIL_USER: 'spa@gmail.com' })).toBeNull();
    expect(selectedTransport({ GMAIL_APP_PASSWORD: 'abcdefghijklmnop' })).toBeNull();
  });

  it('prefers the one already sending when both are configured', () => {
    // Mid-migration both sets exist. Staying on gmail until MAIL_TRANSPORT is
    // set deliberately means adding Resend's variables cannot silently switch
    // the sender address customers see.
    expect(selectedTransport({ ...gmail, ...resend })).toBe('gmail');
  });

  it('lets MAIL_TRANSPORT override the inference, either way', () => {
    expect(selectedTransport({ ...gmail, ...resend, MAIL_TRANSPORT: 'resend' })).toBe('resend');
    expect(selectedTransport({ ...gmail, ...resend, MAIL_TRANSPORT: 'gmail' })).toBe('gmail');
    expect(selectedTransport({ ...gmail, MAIL_TRANSPORT: 'GMAIL' })).toBe('gmail');
  });

  it('ignores a MAIL_TRANSPORT naming something that does not exist', () => {
    expect(selectedTransport({ ...gmail, MAIL_TRANSPORT: 'sendgrid' })).toBe('gmail');
  });
});

describe('building a transport', () => {
  it('returns null when nothing is configured, rather than throwing', () => {
    // This is the normal state locally and before §1.2 is done. A booking is
    // not a failure because there is no mailer.
    expect(getTransport({})).toBeNull();
  });

  it('reports the address it will send from', () => {
    expect(getTransport(gmail)?.from).toBe('spa@gmail.com');
    expect(getTransport(resend)?.from).toBe('bookings@spa.co.za');
  });

  it('strips a display name off the configured Resend sender', () => {
    const transport = getTransport({ ...resend, BOOKING_FROM_EMAIL: 'Spa <bookings@spa.co.za>' });
    expect(transport?.from).toBe('bookings@spa.co.za');
  });
});

describe('the From header', () => {
  it('composes a display name when there is one', () => {
    expect(withDisplayName('spa@gmail.com', 'Smart Nails and Beauty Spa')).toBe(
      '"Smart Nails and Beauty Spa" <spa@gmail.com>',
    );
  });

  it('falls back to the bare address with no name', () => {
    expect(withDisplayName('spa@gmail.com', undefined)).toBe('spa@gmail.com');
    expect(withDisplayName('spa@gmail.com', '   ')).toBe('spa@gmail.com');
  });

  // The name comes from the businesses row, which the owner edits in Admin >
  // Setup. A newline there must not be able to add headers to the message.
  it('cannot be used to inject a header', () => {
    const composed = withDisplayName('spa@gmail.com', 'Spa\r\nBcc: attacker@evil.com');
    expect(composed).not.toMatch(/[\r\n]/);
    expect(composed).toBe('"Spa Bcc: attacker@evil.com" <spa@gmail.com>');
  });

  it('cannot be used to break out of the quoted string', () => {
    expect(withDisplayName('spa@gmail.com', 'Spa" <evil@evil.com> "')).toBe(
      '"Spa <evil@evil.com>" <spa@gmail.com>',
    );
  });
});

describe('bareAddress', () => {
  it('accepts both forms an address is written in', () => {
    expect(bareAddress('a@b.co.za')).toBe('a@b.co.za');
    expect(bareAddress('Name <a@b.co.za>')).toBe('a@b.co.za');
    expect(bareAddress('  a@b.co.za  ')).toBe('a@b.co.za');
  });
});

describe('verifying credentials', () => {
  // The point of verify() is that shape checks cannot catch a wrong password.
  // Only Gmail offers a check that does not send a message; Resend does not,
  // and saying so is better than implying it was checked.
  it('is offered for gmail and not for resend', () => {
    expect(typeof getTransport(gmail)?.verify).toBe('function');
    expect(getTransport(resend)?.verify).toBeUndefined();
  });

  it('reports a failure rather than throwing, so /api/health survives it', async () => {
    // These credentials are not real, so this fails one way or another —
    // rejected by Gmail where the network allows it, or timed out at the 10s
    // bound where it does not. Either way the contract under test is the same:
    // verify() RETURNS a failure, and /api/health stays up to report it.
    const transport = getTransport({
      GMAIL_USER: 'spa@gmail.com',
      GMAIL_APP_PASSWORD: 'abcdefghijklmnop',
    });

    const result = await transport!.verify!();
    expect(result.ok).toBe(false);
    // Never leaks the credential, whatever went wrong.
    expect(result.detail).not.toContain('abcdefghijklmnop');
  }, 30_000);
});

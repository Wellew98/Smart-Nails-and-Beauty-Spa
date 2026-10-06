import 'server-only';

/**
 * Who actually puts the email on the wire.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 *
 * Spec v2 §16 names `RESEND_API_KEY`, and Resend is the better long-term
 * answer. But Resend will only send from a domain you have verified, and the
 * spa does not own one yet — its Google Business Profile carries no email
 * address either. Waiting on a domain purchase to satisfy a blocking launch
 * item (§1.2) is the wrong trade when a free path exists that works today.
 *
 * So the provider is a seam rather than a hard dependency. Gmail now, Resend
 * the day a domain is verified, and the switch is environment variables — not
 * an edit to the message composition in `lib/email.ts`.
 *
 * WHY GMAIL SMTP AND NOT THE GMAIL API. The API needs the `gmail.send` scope,
 * which Google classes as sensitive. In an unpublished project the refresh
 * token expires after seven days, so email would die every week; avoiding that
 * means submitting the app for Google's verification review. Zapier and Make
 * get away with it because they passed that review once as a large verified
 * app and you are granting *their* app access. An app password over SMTP
 * reaches the identical mailbox with none of it.
 *
 * WHY NOT A THIRD-PARTY ESP ON A GMAIL ADDRESS. Brevo, SendGrid and Mailjet
 * will all verify a lone `@gmail.com` sender without a domain. It is a trap:
 * mail then leaves *their* servers claiming to be *from* gmail.com, which
 * fails SPF and DKIM alignment against Gmail's own DMARC record. It largely
 * still lands today, and it is exactly the pattern the 2024 Google/Yahoo bulk
 * sender rules have been tightening on. Sending as Gmail through Gmail aligns
 * perfectly and is the most deliverable of the free options.
 * ---------------------------------------------------------------------------
 */

export type TransportName = 'gmail' | 'resend';

export interface Message {
  to: string;
  subject: string;
  html: string;
  /** Display name in the inbox. The address itself is fixed by the transport. */
  fromName?: string;
}

export interface MailTransport {
  readonly name: TransportName;
  /** The bare address mail leaves from. Never a value to log. */
  readonly from: string;
  send(message: Message): Promise<void>;
  /**
   * Ask the provider whether these credentials actually work, without sending
   * anything. Null when the provider offers no way to check cheaply.
   *
   * Exists because shape checks are not enough: `/api/health` can confirm an
   * App Password is 16 characters and still be looking at 16 wrong ones. The
   * first symptom would otherwise be an email that silently never arrives,
   * which is the exact failure §1.2 is about.
   */
  verify?(): Promise<VerifyResult>;
}

export interface VerifyResult {
  ok: boolean;
  detail: string;
}

export type EnvLike = Record<string, string | undefined>;

/**
 * `Name <addr@domain>`, or the bare address when there is no name.
 *
 * Exported for tests: the display name comes from the `businesses` row, which
 * the owner can edit in Admin > Setup, so it is untrusted input reaching a mail
 * header. A newline in a header is how header injection works.
 */
export function withDisplayName(address: string, name: string | undefined): string {
  if (!name) return address;
  // A quoted string cannot contain a bare quote or backslash without escaping,
  // and a header must not contain a newline.
  const safe = name.replace(/[\\"]/g, '').replace(/[\r\n]+/g, ' ').trim();
  return safe ? `"${safe}" <${address}>` : address;
}

/** Strips `Name <addr>` down to `addr`. */
export function bareAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim() ?? value.trim();
}

/**
 * Which transport this deployment is configured for.
 *
 * Explicit `MAIL_TRANSPORT` wins; otherwise it is inferred from whichever
 * credentials are actually present. Inference is deliberate — one fewer
 * variable to set, and one fewer way to end up with a transport named but not
 * credentialled. Gmail is checked first so that a deployment carrying both
 * (mid-migration) keeps using the one it was already sending on until the
 * switch is made deliberately.
 */
export function selectedTransport(env: EnvLike = process.env): TransportName | null {
  const explicit = env.MAIL_TRANSPORT?.trim().toLowerCase();
  if (explicit === 'gmail' || explicit === 'resend') return explicit;

  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) return 'gmail';
  if (env.RESEND_API_KEY) return 'resend';
  return null;
}

/**
 * Build the transport, or null when this deployment cannot send.
 *
 * Null is a normal, expected state — local development and any deployment
 * before §1.2 is done. Callers treat it as "do not send", never as an error:
 * a booking is not a failure because there is no mailer.
 */
export function getTransport(env: EnvLike = process.env): MailTransport | null {
  switch (selectedTransport(env)) {
    case 'gmail':
      return gmailTransport(env);
    case 'resend':
      return resendTransport(env);
    default:
      return null;
  }
}

/**
 * Turn a provider's failure into something a person can act on.
 *
 * SMTP rejections are numeric codes wrapped in marketing URLs; "535-5.7.8
 * Username and Password not accepted" does not tell the reader that they most
 * likely pasted their account password. Anything unrecognised is passed
 * through as-is rather than flattened, since an unknown failure is exactly
 * when the raw text is worth having.
 *
 * Never includes the credential: nodemailer reports the server's response, not
 * what was sent to it.
 */
function explainSmtpFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/Invalid login|535|Username and Password not accepted/i.test(raw)) {
    return (
      'Gmail rejected the credentials. Either GMAIL_APP_PASSWORD is not a valid App Password ' +
      '(the account password will not work), or it belongs to a different account than ' +
      'GMAIL_USER, or 2-Step Verification is off so the App Password has been revoked.'
    );
  }

  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return `Could not reach smtp.gmail.com — ${raw}`;
  }

  return raw;
}

/**
 * Shared by `send` and `verify`, so what is verified is exactly what sends.
 *
 * Timeouts are bounded deliberately. nodemailer defaults to two minutes, and
 * sends run inside `after()` — which keeps the serverless function alive until
 * they finish. An unreachable SMTP host would therefore hold a function open
 * for the full two minutes, burning execution time and risking the platform's
 * max duration, to deliver an email that was never going to arrive. Ten
 * seconds is far more than a healthy Gmail handshake needs, and failing fast
 * costs only a log line: the booking is already committed and already
 * answered.
 */
function gmailOptions(user: string, pass: string) {
  return {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS on 587. Port 465 is the implicit-TLS one.
    auth: {
      user,
      // Google removed "less secure app" passwords; this is an App Password,
      // which requires 2-Step Verification on the account and is the supported
      // way to authenticate SMTP.
      pass: pass.replace(/\s+/g, ''), // Google displays it in four groups of four.
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}

function gmailTransport(env: EnvLike): MailTransport | null {
  const user = env.GMAIL_USER;
  const pass = env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  return {
    name: 'gmail',
    from: user,

    async verify() {
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport(gmailOptions(user, pass));
      try {
        // Opens the connection, does STARTTLS and AUTH, then stops. No message.
        await transporter.verify();
        return { ok: true, detail: 'Gmail accepted these credentials' };
      } catch (error) {
        return { ok: false, detail: explainSmtpFailure(error) };
      } finally {
        transporter.close();
      }
    },

    async send(message) {
      // Imported lazily so a Resend deployment never loads nodemailer, and so
      // this module stays importable from unit tests that only read config.
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport(gmailOptions(user, pass));

      await transporter.sendMail({
        from: withDisplayName(user, message.fromName),
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
      transporter.close();
    },
  };
}

function resendTransport(env: EnvLike): MailTransport | null {
  const key = env.RESEND_API_KEY;
  if (!key) return null;

  // Unlike Gmail, the sender here is not implied by the credential: an API key
  // can send from any verified domain, so the address must be stated.
  const from = env.BOOKING_FROM_EMAIL ?? 'bookings@example.com';

  return {
    name: 'resend',
    from: bareAddress(from),
    async send(message) {
      const { Resend } = await import('resend');
      const resend = new Resend(key);
      const result = await resend.emails.send({
        from: withDisplayName(bareAddress(from), message.fromName),
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
      // The SDK reports failures in the response rather than by throwing, so a
      // rejected send would otherwise look like a success.
      if (result.error) throw new Error(result.error.message);
    },
  };
}

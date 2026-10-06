import type { Metadata } from 'next';
import Link from 'next/link';
import { getBusiness } from '@/lib/public-data';
import { formatPhoneForDisplay, whatsappLink } from '@/lib/phone';
import { PRIVACY_LAST_UPDATED } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What we collect when you book, what we use it for, and how to have it removed.',
};

/**
 * Spec §9 — POPIA notice.
 *
 * THE COPY RULE APPLIES HERE TOO, AND HARDER (§2).
 *
 * Every sentence on this page is a statement about what the code does, and is
 * checkable against it. That is the only reason a page like this may be
 * written at all without the owner's sign-off — it describes the system, not
 * the business's practices. Before editing, verify against the source:
 *
 *   what is collected     `customers` and `appointments` in 0001_init.sql
 *   what it is used for   lib/email.ts — confirmation, owner notice, cancellation
 *   who else sees it      lib/email.ts (Resend), lib/db.ts (Supabase)
 *   the login cookie      proxy.ts — `matcher` is /admin only
 *   the manage link       lib/booking.ts generateManageToken — 32 random bytes
 *   deletion              lib/booking.ts forgetCustomer — anonymise, never delete
 *   chat transcripts      0007_ai_conversations.sql, lib/ai/transcript.ts
 *   the 30 days           lib/ai/transcript.ts DEFAULT_RETENTION_DAYS
 *   what the AI is sent   app/api/ai/chat/route.ts — name and phone are in the
 *                         envelope, never in `messages`
 *   the chat on your      components/ai/chat-session.ts — sessionStorage, and
 *   own device            it is not a cookie
 *   vouchers               0008_vouchers.sql, lib/vouchers.ts — no anon/authenticated
 *                          RLS access, /v/[token] queries lookup_token only
 *   voucher erasure        lib/vouchers.ts eraseVoucherPersonalData, wired into
 *                          lib/booking.ts forgetCustomer
 *
 * Do NOT add a claim here about how the business handles data offline — its
 * paper diary, its staff, its retention habits. None of that is ours to
 * assert, and a privacy notice is exactly the wrong place to guess.
 *
 * §9.2: the BUSINESS is the responsible party under POPIA. Whoever runs this
 * site is an operator processing on its behalf. This page says so rather than
 * leaving a customer to work out who to ask.
 *
 * This is not legal advice. It is the set of things that are obviously right
 * and cost nothing.
 */
export default async function PrivacyPage() {
  const business = (await getBusiness())!;

  return (
    <div className="mx-auto max-w-2xl px-5 pt-14 pb-4 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">Privacy</p>
      <h1 className="font-display mt-4 text-[2.25rem] leading-[1.05] font-semibold text-aubergine-900 sm:text-5xl">
        What we keep, and how to have it removed.
      </h1>
      <p className="mt-6 text-[1.05rem] leading-relaxed text-mauve-600">
        Booking a treatment means giving us your name and a number to reach you on. This page
        says exactly what happens to it. It is short because there is not much of it.
      </p>

      <Section title="Who holds it">
        <p>
          <strong className="font-medium text-aubergine-900">{business.name}</strong> is the
          responsible party for your information under the Protection of Personal Information Act.
          The booking system is run on the studio&rsquo;s behalf by whoever operates this site,
          which makes them an operator: they may only process your details on the
          studio&rsquo;s instructions, for the purposes below.
        </p>
        <p>Ask the studio anything about your information:</p>
        <ul className="not-prose mt-1 space-y-2">
          {business.address && <li className="text-mauve-600">{business.address}</li>}
          <li>
            <a href={`tel:${business.phone}`} className="text-lacquer-500 underline underline-offset-4">
              {formatPhoneForDisplay(business.phone)}
            </a>
          </li>
          {business.whatsapp && (
            <li>
              <a
                href={whatsappLink(business.whatsapp, 'Hi, a question about my details.')}
                className="text-lacquer-500 underline underline-offset-4"
              >
                WhatsApp {formatPhoneForDisplay(business.whatsapp)}
              </a>
            </li>
          )}
          {business.email && (
            <li>
              <a
                href={`mailto:${business.email}`}
                className="text-lacquer-500 underline underline-offset-4"
              >
                {business.email}
              </a>
            </li>
          )}
        </ul>
      </Section>

      <Section title="What we collect">
        <p>When you book, the form asks for three things:</p>
        <ul>
          <li>
            <strong className="font-medium text-aubergine-900">Your name</strong>, so the
            therapist knows who is coming.
          </li>
          <li>
            <strong className="font-medium text-aubergine-900">Your mobile number</strong>, so we
            can reach you about the appointment. It is also how we recognise you next time,
            instead of making you set up an account.
          </li>
          <li>
            <strong className="font-medium text-aubergine-900">Your email address</strong>, which
            is optional. Give it and you get a confirmation you can keep; leave it out and
            everything still works.
          </li>
        </ul>
        <p>
          Alongside that we keep the bookings themselves (the treatment, the time, the therapist
          and the price on the day) because that is the diary. If you tell us something about an
          appointment over the phone, the studio may note it against your booking.
        </p>
        <p>
          If you use the chat button on the site, we also keep what you typed and what the
          assistant replied. There is a section on that below.
        </p>
        <p>We ask for nothing else. There is no account to create and no payment taken online.</p>
      </Section>

      <Section title="What we use it for">
        <p>
          Making and keeping your booking, and contacting you about that booking. Specifically:
          confirming it by email if you gave us one, letting the studio know it came in, and
          telling the studio if you cancel.
        </p>
        <p>
          That is the whole list.{' '}
          <strong className="font-medium text-aubergine-900">
            We do not send marketing, and there is no mailing list to be added to.
          </strong>{' '}
          Details you give us to book a treatment are used to book that treatment. If the studio
          ever wants to send you anything else, it has to ask you first, separately.
        </p>
        <p>We do not sell your details, and we do not share them for anyone else&rsquo;s advertising.</p>
      </Section>

      <Section title="Who else sees it">
        <p>
          The studio&rsquo;s own staff, through the private diary they sign in to. Beyond that,
          only the suppliers that make the site work: the booking database is hosted with a cloud
          database provider, and confirmation emails are sent through an email delivery provider.
          They process your details to provide those services and for nothing else.
        </p>
      </Section>

      <Section title="Your booking link">
        <p>
          The link in your confirmation is how you move or cancel a booking without phoning. It
          carries a long random code and nothing else: no name, no number. The address
          itself gives nothing away if it is seen over your shoulder. Anyone with that link can
          see and change that one booking, so treat it like a ticket. Manage pages are also kept
          out of search engines.
        </p>
      </Section>

      <Section title="Gift vouchers">
        <p>
          Vouchers are bought and paid for in the studio, never online — the site never takes a
          payment. When one is issued, the studio may record who bought it, a phone number for
          them, and an email address to send the code to. All three are optional: a voucher works
          with none of them.
        </p>
        <p>
          There is no account for a voucher either.{' '}
          <strong className="font-medium text-aubergine-900">
            The short code on the card, and the link it can be emailed with, are what let anyone
            holding them check the balance
          </strong>{' '}
          — the same way your booking link works above. A voucher is transferable by law, so it is
          not tied to whoever bought it, and the balance page shows nothing about the purchaser: no
          name, no phone number, only the value, the history and the expiry date.
        </p>
      </Section>

      <Section title="The chat button">
        <p>
          The chat on this site is answered by an AI assistant, not by a person. It can tell you
          about treatments and times, and it can make a booking for you.
        </p>
        <p>
          <strong className="font-medium text-aubergine-900">
            We keep what you typed and what it replied for 30 days, and then it is deleted
            automatically.
          </strong>{' '}
          The studio reads these to see what people are asking for. Nothing else is stored with
          them: no name, no number, no record of who was at the keyboard. If the conversation ends
          in a booking, it is linked to that booking so that deleting your details deletes the
          conversation too.
        </p>
        <p>
          If you book through the chat, the name and number you type into the confirmation card
          are sent straight to the booking system.{' '}
          <strong className="font-medium text-aubergine-900">
            They are never part of the conversation, so they are never sent to the AI provider and
            never appear in what we keep.
          </strong>{' '}
          The messages themselves are sent to that provider in order to be answered, and to nobody
          else.
        </p>
        <p>
          Anything you type into the chat yourself is kept as you typed it, so please do not type
          anything into it you would not want kept for a month. You never have to use it: the{' '}
          <Link href="/book" className="text-lacquer-500 underline underline-offset-4">
            booking page
          </Link>{' '}
          does everything the chat does, and asks only for a name and a number.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Past bookings stay on the diary as the studio&rsquo;s record of work done, which is what
          a diary is for. Your name and contact details stay with them until you ask us to remove
          them.
        </p>
        <p>Chat conversations are the exception: those are deleted after 30 days, every time.</p>
      </Section>

      <Section title="Having your details removed">
        <p>
          Open your booking link and choose{' '}
          <strong className="font-medium text-aubergine-900">Delete my details</strong>. Your name,
          number and email address are erased immediately, along with any notes kept against you
          or your appointments. The appointments themselves stay on the diary without them, so the
          studio&rsquo;s record of the day does not develop a hole, but they will no longer be
          connected to you, and nobody can look them up by your name or number afterwards. Any
          chat conversation that led to one of your bookings is deleted outright at the same time.
        </p>
        <p>
          Your booking link stops working at that point, and it cannot be undone. Any booking
          still to come is cancelled at the same time, since we would have no way to reach you
          about it. If you would rather ask a person, phone or WhatsApp the studio on the number
          above.
        </p>
        <p>
          If your name, phone number or email is recorded against a gift voucher, that is erased
          the same way and at the same time. The voucher itself keeps working exactly as before —
          its balance, its history and its expiry are the studio&rsquo;s financial record, not
          yours to erase, and whoever is holding the card or the link can still use it. Only who it
          names is removed, and the link it was emailed with stops working, so an old email cannot
          be used to identify you afterwards.
        </p>
        <p>
          You can also ask the studio for a copy of what it holds about you, or to correct
          anything that is wrong.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Browsing the site and booking a treatment set no cookies at all. There is no analytics,
          no advertising and no tracking on this site, which is why you were not asked to agree to
          any. The only cookie the site ever sets is a sign-in session for the studio&rsquo;s own
          staff on the private diary pages, and it is required for signing in to work.
        </p>
        <p>
          One thing that is not a cookie but is worth saying plainly: if you use the chat, your
          browser keeps that conversation on your own device so that closing the panel or
          reloading the page does not lose it. It is not sent anywhere by being there, it is not
          used to recognise you, and{' '}
          <strong className="font-medium text-aubergine-900">
            your browser discards it when you close the tab.
          </strong>
        </p>
      </Section>

      <Section title="If you are not happy">
        <p>
          Speak to the studio first. It is two people and a phone, and most things are sorted in
          a minute. If that does not resolve it, you have the right to complain to the Information
          Regulator (South Africa), the body that oversees POPIA, at{' '}
          <a
            href="https://inforegulator.org.za"
            className="text-lacquer-500 underline underline-offset-4"
          >
            inforegulator.org.za
          </a>
          .
        </p>
      </Section>

      <div className="mt-14 border-t border-gilt-200/70 pt-6">
        <p className="text-xs text-mauve-400">Last updated {PRIVACY_LAST_UPDATED}.</p>
        <Link
          href="/book"
          className="mt-6 inline-block rounded-full bg-lacquer-500 px-6 py-3 text-sm font-medium text-blush-50 hover:bg-lacquer-600"
        >
          Book a treatment
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t border-gilt-200/70 pt-7">
      <h2 className="font-display text-xl font-semibold text-aubergine-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[0.98rem] leading-relaxed text-mauve-600 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

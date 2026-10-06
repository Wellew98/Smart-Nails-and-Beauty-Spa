import type { Metadata } from 'next';
import { BookButton } from '@/components/book-button';
import { getActiveStaff, getBusiness } from '@/lib/public-data';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About',
  description: 'A small studio with three therapists, proper appointment lengths and no rushing.',
};

export default async function AboutPage() {
  const business = (await getBusiness())!;
  const staff = await getActiveStaff(business.id);

  return (
    <div className="mx-auto max-w-5xl px-5 pt-14 pb-4 sm:pt-20">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">About</p>

      <h1 className="font-display mt-4 max-w-[15ch] text-[2.5rem] leading-[1] font-semibold text-aubergine-900 sm:text-6xl">
        {SITE.about.lead}
      </h1>

      <div className="mt-12 grid gap-12 sm:grid-cols-[1.4fr_1fr] sm:gap-16">
        <div className="space-y-6">
          {SITE.about.body.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="text-[1.05rem] leading-relaxed text-mauve-600">
              {paragraph}
            </p>
          ))}
        </div>

        <div>
          <h2 className="text-xs tracking-[0.18em] text-gilt-600 uppercase">The team</h2>
          <ul className="mt-5 space-y-4">
            {staff.map((member) => (
              <li key={member.id} className="border-b border-blush-200 pb-4 last:border-0">
                <p className="font-display text-lg font-semibold text-aubergine-900">{member.name}</p>
                <p className="mt-0.5 text-sm text-mauve-400">Therapist</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-16 border-t border-gilt-200/70 pt-10">
        <h2 className="font-display text-2xl font-semibold text-aubergine-900">
          What you can count on
        </h2>
        <dl className="mt-7 grid gap-8 sm:grid-cols-3">
          {[
            {
              term: 'The full time',
              detail:
                'A 60-minute massage is sixty minutes of massage. The turnaround time is booked separately so it never comes out of your appointment.',
            },
            {
              term: 'One room, one guest',
              detail:
                'Rooms and equipment are booked alongside the therapist, so you are never waiting for a table to free up after you have arrived.',
            },
            {
              term: 'Change it yourself',
              detail:
                'Every confirmation carries a link to move or cancel your booking. No phoning during business hours to change a time.',
            },
          ].map((item) => (
            <div key={item.term}>
              <dt className="font-display text-lg font-semibold text-aubergine-900">{item.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-mauve-500">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-14">
        <BookButton />
      </div>
    </div>
  );
}

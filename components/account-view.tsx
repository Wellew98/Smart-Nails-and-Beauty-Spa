'use client';

import Link from 'next/link';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';
import type { Visit } from '@/lib/account';
import { formatZar } from '@/lib/money';

/**
 * Outcomes build (video system 1): member area.
 * Rendered only when Clerk keys exist; the page itself renders the disabled
 * state otherwise, so this component never loads without a provider.
 */
export function AccountView({ visits }: { visits: Visit[] }) {
  return (
    <section className="section" id="account">
      <div className="wrap">
        <p className="eyebrow">Members</p>
        <Show when="signed-out">
          <h2>Your visits, in one place</h2>
          <p className="sub">
            Sign in to see your visits and rebook in one tap. No more scrolling
            through WhatsApp to find out when you were last in.
          </p>
          <SignInButton mode="modal">
            <button className="btn btn-dark" type="button">
              Sign in
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <div className="account-head">
            <h2>Your visits</h2>
            <UserButton />
          </div>
          {visits.length === 0 ? (
            <p className="sub">
              Nothing linked yet. Book with the same email address you signed in
              with and your history appears here on its own.
            </p>
          ) : (
            <ul className="visit-list">
              {visits.map((visit) => {
                const upcoming = visit.status === 'confirmed' || visit.status === 'pending';
                // Salon is in Johannesburg; visits render in its day, not the
                // phone's timezone, so the date badge matches the diary.
                const day = new Date(visit.starts_at).toLocaleDateString('en-ZA', {
                  timeZone: 'Africa/Johannesburg',
                  day: 'numeric',
                });
                const month = new Date(visit.starts_at).toLocaleDateString('en-ZA', {
                  timeZone: 'Africa/Johannesburg',
                  month: 'short',
                });
                const full = new Date(visit.starts_at).toLocaleDateString('en-ZA', {
                  timeZone: 'Africa/Johannesburg',
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                });
                return (
                  <li key={visit.id} className="visit">
                    <div className="visit-date" aria-hidden="true">
                      <strong>{day}</strong>
                      <span>{month}</span>
                    </div>
                    <div className="visit-body">
                      <div className="visit-top">
                        <strong>{visit.service_name}</strong>
                        <span className={`pill${upcoming ? ' pill-live' : ''}`}>
                          {upcoming
                            ? 'Upcoming'
                            : visit.status === 'completed'
                              ? 'Done'
                              : visit.status}
                        </span>
                      </div>
                      <p className="visit-meta">
                        {full} · with {visit.staff_name} ·{' '}
                        {formatZar(visit.price_cents_at_booking)}
                      </p>
                      {upcoming ? (
                        <Link className="btn btn-dark btn-sm" href={`/b/${visit.manage_token}`}>
                          Manage booking
                        </Link>
                      ) : (
                        <Link className="btn btn-ghost btn-sm" href="/book">
                          Book again
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Show>
      </div>
    </section>
  );
}

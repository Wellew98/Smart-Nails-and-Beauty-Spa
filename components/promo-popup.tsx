'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Signature-offer popup (R500 Special Package). Shows once per session
 * after a short delay, closable via the button, the backdrop or Escape.
 * Online-booking only: the claim button points at /book, never WhatsApp.
 */
export function PromoPopup({ serviceId }: { serviceId: string | null }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (sessionStorage.getItem('smartPromoSeen') === '1') return;
    } catch {
      /* storage unavailable: still show once per page load */
    }
    timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;

  function close() {
    setLeaving(true);
    setTimeout(() => setVisible(false), 250);
    try {
      sessionStorage.setItem('smartPromoSeen', '1');
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`promo-overlay${leaving ? '' : ' open'}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="promo-card" role="dialog" aria-modal="true" aria-labelledby="promoTitle">
        <button className="promo-close" type="button" aria-label="Close promotion" onClick={close}>
          ×
        </button>
        <p className="eyebrow light">Limited signature offer</p>
        <h2 id="promoTitle">
          Special Package — <span className="price">R500</span>
        </h2>
        <p>Massage + Facial + Pedicure (Gel Hands + Gel Feet). One booking, full glow.</p>
        <div className="offer-btns">
          <Link
            className="btn btn-light"
            href={serviceId ? `/book?service=${serviceId}` : '/book'}
            onClick={close}
          >
            Book the R500 special
          </Link>
          <Link className="btn btn-outline-light" href="/prices" onClick={close}>
            See all prices
          </Link>
        </div>
      </div>
    </div>
  );
}

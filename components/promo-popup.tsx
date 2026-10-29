'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Signature-offer popup (the Special Package). Shows once per session after a
 * short delay, closable via the button, the backdrop or Escape. Online-booking
 * only: the claim button points at /book, never WhatsApp.
 *
 * Currently rendered behind `SHOW_PROMO_POPUP` in app/page.tsx, which is false
 * until the owner confirms the R80 and R90 package prices on the 2026-10-30
 * flyer. The copy below quotes R80, so if the price changes, change it here.
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
        <p className="eyebrow light">Three treatments, one booking</p>
        <h2 id="promoTitle">
          Special package, <span className="price">R80</span>
        </h2>
        <p>
          Massage, facial and pedicure in one appointment. The second package
          pairs a full mani, a full pedi and gelish brows.
        </p>
        <div className="offer-btns">
          <Link
            className="btn btn-light"
            href={serviceId ? `/book?service=${serviceId}` : '/book'}
            onClick={close}
          >
            Book the special package
          </Link>
          <Link className="btn btn-outline-light" href="/prices" onClick={close}>
            See all prices
          </Link>
        </div>
      </div>
    </div>
  );
}

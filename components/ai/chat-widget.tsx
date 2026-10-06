'use client';

import { useState } from 'react';
import { ChatWindow } from './chat-window';

/**
 * The floating button, and the panel it opens.
 *
 * ---------------------------------------------------------------------------
 * IT IS ONLY RENDERED WHEN THE ASSISTANT IS CONFIGURED.
 *
 * The layout decides that, server-side, from `providerConfigProblem()` — so a
 * deployment with no key ships no button, no panel and no chat JavaScript at
 * all, rather than a button that apologises. That is the strict version of
 * spec §51: with `GEMINI_API_KEY` removed, there is nothing on the page that
 * could fail, and `/book` is untouched because it never knew this existed.
 *
 * The button sits above the thumb on a phone. `/book` remains the primary path
 * everywhere on the site; this is the second one, not a replacement for it.
 *
 * BEING FIXED, IT PARKS ON WHATEVER IS IN THE BOTTOM-RIGHT CORNER at the foot
 * of the page, and it wins every tap there. That took out the footer's "Staff
 * login" link at every width until `SiteFooter` started reserving room for it
 * (see `chatWidgetPresent` there). Anything new that lands in the last row of
 * a page has the same problem.
 * ---------------------------------------------------------------------------
 */
export function ChatWidget({
  businessName,
  maxMessageLength,
}: {
  businessName: string;
  maxMessageLength: number;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <ChatWindow
        businessName={businessName}
        maxMessageLength={maxMessageLength}
        onClose={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed right-4 bottom-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-aubergine-900 px-5 py-3 text-sm font-medium text-blush-50 shadow-lg transition-colors hover:bg-aubergine-800 sm:right-5 sm:bottom-5"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.6A8 8 0 1 1 21 12Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Ask us anything
    </button>
  );
}

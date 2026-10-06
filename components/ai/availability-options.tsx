'use client';

import type { AvailabilityAttachment } from '@/lib/ai/types';

/**
 * Free times as tappable buttons rather than a paragraph to retype.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH BUTTON CARRIES, AND WHY
 *
 * The ISO INSTANT, not the label it shows. A client that sent back '11:15'
 * would be asking the server to rebuild an instant from a wall clock and a
 * timezone — the naive-local-time mistake that already shipped once in the
 * walk-in form (v2 §12).
 *
 * The STAFF ID only when the customer actually asked for that therapist.
 * `staffPinned` is false when they said "anyone", in which case the resolved
 * id is simply whoever sorted first among the free, and sending it would lock
 * an indifferent customer to one person — producing a clash where "Anyone"
 * would have found someone else. Sending null is what `/book` does, and it
 * lets the write path resolve under the advisory lock.
 *
 * Never the resource id. The room is re-resolved server-side at write time and
 * has no business travelling through a browser.
 * ---------------------------------------------------------------------------
 */
export function AvailabilityOptions({
  attachment,
  onChoose,
  disabled,
}: {
  attachment: AvailabilityAttachment;
  onChoose: (option: {
    serviceId: string;
    startsAt: string;
    staffId: string | null;
    staffName: string;
    label: string;
    price: string;
  }) => void;
  disabled: boolean;
}) {
  if (attachment.options.length === 0) return null;

  // Naming the therapist under every time is noise when one person covers the
  // whole day. Same rule the booking flow already applies.
  const names = new Set(attachment.options.map((option) => option.staffName));
  const showNames = names.size > 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachment.options.map((option) => (
          <button
            key={option.startsAt}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChoose({
                serviceId: attachment.serviceId,
                startsAt: option.startsAt,
                staffId: attachment.staffPinned ? option.staffId : null,
                staffName: option.staffName,
                label: option.time,
                price: attachment.servicePrice,
              })
            }
            className="min-h-11 rounded-xl border border-blush-200 bg-white px-3.5 py-2 text-center transition-colors hover:border-lacquer-400 disabled:opacity-50"
          >
            <span className="tabular block font-mono text-[0.95rem] leading-none text-aubergine-900">
              {option.time}
            </span>
            {showNames && (
              <span className="mt-1 block text-[0.7rem] text-mauve-400">{option.staffName}</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-[0.7rem] text-mauve-400">
        Tapping a time carries on the conversation. Nothing is booked until you finish on the
        booking page.
      </p>
    </div>
  );
}

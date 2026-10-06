'use client';

import { Swatch } from '@/components/swatch';
import type { ServicesAttachment } from '@/lib/ai/types';

/**
 * Treatments as cards rather than a paragraph.
 *
 * Name, length and price, all from the database via `get_services` — the same
 * rows `/services` renders. Carries the swatch so a treatment looks the same
 * here as it does everywhere else on the site.
 *
 * Tapping sends a STRUCTURED ACTION carrying the service id, not the text of
 * the button. The model never has to re-interpret what the customer chose, and
 * the server re-checks the id against the database before it means anything.
 */
export function ServiceCards({
  attachment,
  onChoose,
  disabled,
}: {
  attachment: ServicesAttachment;
  onChoose: (serviceId: string, name: string) => void;
  disabled: boolean;
}) {
  if (attachment.services.length === 0) return null;

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {attachment.services.map((service) => (
          <li key={service.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(service.id, service.name)}
              className="flex w-full items-center gap-3 rounded-xl border border-blush-200 bg-white px-3 py-3 text-left transition-colors hover:border-lacquer-400 disabled:opacity-50"
            >
              <Swatch serviceName={service.name} size="dot" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] leading-tight text-aubergine-900">
                  {service.name}
                </span>
                <span className="tabular mt-0.5 block text-xs text-mauve-400">
                  {service.duration}
                </span>
              </span>
              <span className="tabular text-sm font-medium text-aubergine-900">{service.price}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

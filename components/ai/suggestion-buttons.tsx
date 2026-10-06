'use client';

/**
 * The four things people actually open a spa chat to ask.
 *
 * Shown only on an empty conversation. A blank input with a cursor is the
 * hardest thing to answer on a phone; four taps is not.
 *
 * These are plain text, not structured actions — they are shortcuts for typing,
 * and the server treats them exactly as it treats anything typed.
 */
export const SUGGESTIONS = [
  'Book an appointment',
  'View treatments',
  'Check availability',
  'What are your opening hours?',
] as const;

export function SuggestionButtons({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          className="min-h-11 rounded-full border border-blush-300 px-4 py-2 text-sm text-aubergine-900 transition-colors hover:bg-blush-100 disabled:opacity-50"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

'use client';

import { useRef, useState } from 'react';

/**
 * The composer.
 *
 * A textarea rather than an input so a long question wraps instead of scrolling
 * sideways, capped at a few lines so it never eats the conversation. Enter
 * sends; Shift+Enter is a newline — the convention every messaging app on a
 * phone already taught the customer.
 *
 * `maxLength` mirrors the server's own limit. The server is the authority and
 * rejects anything longer; this only stops the customer typing a paragraph that
 * was always going to be refused.
 */
export function ChatInput({
  onSend,
  disabled,
  maxLength,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  maxLength: number;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    onSend(text);
    // Keep the keyboard up. Losing focus after every message means a tap to
    // reopen it for every single turn.
    ref.current?.focus();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex items-end gap-2 border-t border-blush-200 bg-blush-50 p-3"
    >
      <label className="sr-only" htmlFor="ai-chat-input">
        Your message
      </label>
      <textarea
        id="ai-chat-input"
        ref={ref}
        rows={1}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="Ask about treatments or times…"
        className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-blush-300 bg-white px-4 py-2.5 text-[0.95rem] text-aubergine-900 placeholder:text-mauve-400 focus:border-lacquer-400 focus:outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-lacquer-500 text-blush-50 transition-colors hover:bg-lacquer-600 disabled:opacity-40"
      >
        <span className="sr-only">Send</span>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}

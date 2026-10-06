import Link from 'next/link';

/**
 * One turn in the conversation.
 *
 * The customer's turns sit right and are filled; the assistant's sit left and
 * are plain. Same lacquer as every other primary action on the site — the chat
 * is part of the site, not a widget bolted onto it.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Assistant turns that could not be answered offer the booking page. */
  degraded?: boolean;
}

export function ChatMessage({ turn, bookUrl }: { turn: ChatTurn; bookUrl: string }) {
  const mine = turn.role === 'user';

  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.95rem] leading-relaxed ${
          mine
            ? 'rounded-br-md bg-lacquer-500 text-blush-50'
            : 'rounded-bl-md bg-blush-100 text-aubergine-900'
        }`}
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
        {turn.degraded && (
          <Link
            href={bookUrl}
            className="mt-2 inline-block rounded-full bg-aubergine-900 px-4 py-2 text-sm font-medium text-blush-50"
          >
            Go to booking
          </Link>
        )}
      </div>
    </div>
  );
}

/** Three dots. A silent pause reads as broken. */
export function ChatThinking() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-blush-100 px-4 py-3.5">
        <span className="sr-only">Thinking</span>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-bounce rounded-full bg-mauve-400"
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

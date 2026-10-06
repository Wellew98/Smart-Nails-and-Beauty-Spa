'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AvailabilityOptions } from './availability-options';
import { BookingSummary, type PendingBooking } from './booking-summary';
import { loadSession, newConversationId, saveSession } from './chat-session';
import { ChatInput } from './chat-input';
import { ChatMessage, ChatThinking, type ChatTurn } from './chat-message';
import { SmartMark } from '@/components/smart-mark';
import { ManageLink } from './manage-link';
import { ServiceCards } from './service-cards';
import { SuggestionButtons } from './suggestion-buttons';
import type { BookingAttachment, ChatAttachment } from '@/lib/ai/types';

/**
 * The conversation panel.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE CONVERSATION LIVES — THREE PLACES, AND THEY ARE NOT THE SAME THING.
 *
 *   1. HERE, in component state. The live conversation.
 *   2. In sessionStorage, so closing the panel or reloading the page does not
 *      throw it away. Dies with the tab. See chat-session.ts for why that and
 *      not localStorage.
 *   3. In Postgres, for thirty days, so the owner can read what people asked.
 *      Written server-side by the chat route; the browser's only part in it is
 *      the `conversationId` it mints and echoes. See lib/ai/transcript.ts.
 *
 * (3) REVERSES THE ORIGINAL DESIGN, in which nothing was stored anywhere and
 * closing the tab was the retention policy. The owner needed to see what
 * customers ask, and there is no way to answer that without keeping the words.
 * What did NOT change is the rule underneath it: name, phone and manage token
 * travel in the request envelope and never inside `messages`, so they cannot
 * reach the transcript by any path.
 *
 * Only user and assistant TEXT is sent back on the next turn. Tool calls and
 * tool results stay server-side inside a single request, so a client cannot
 * replay a forged tool result — and the ids in `attachments` are used for
 * structured actions but never re-enter the model's context.
 * ---------------------------------------------------------------------------
 */

const GREETING =
  "Hi! I can help you find a treatment, check what's free, or answer anything about the studio. What are you after?";

interface ChatResponse {
  reply: string;
  attachments?: ChatAttachment[];
  degraded?: boolean;
  bookUrl?: string;
}

/**
 * Drop the treatment menu when it is INCIDENTAL to a more specific answer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A RULE ABOUT ONE TURN AND NOT A MEMORY OF PAST TURNS.
 *
 * The problem being solved is stacking: the model often re-calls `get_services`
 * on a follow-up turn, and the full menu then renders underneath the times the
 * customer actually asked for.
 *
 * An earlier version fixed that by fingerprinting the menu and suppressing it
 * whenever it matched the last one seen. The menu does not change between
 * turns, so the fingerprint always matched — and the cards were suppressed for
 * the rest of the conversation. "Show me the treatments again" then rendered
 * nothing, and since the model projection carries no prices or durations and
 * the system prompt tells it not to list treatments, the assistant could
 * neither show the menu nor say it. Both ways out were closed at once.
 *
 * So the test is what ELSE arrived in the same turn, not what arrived before.
 * Menu alone means the customer asked for the menu: show it, every time they
 * ask. Menu next to times or a booking means the model fetched it in passing:
 * drop it, because the specific answer is the one they wanted.
 * ---------------------------------------------------------------------------
 */
function withoutIncidentalMenu(incoming: ChatAttachment[]): ChatAttachment[] {
  const hasSomethingMoreSpecific = incoming.some(
    (item) => item.kind === 'availability' || item.kind === 'booking' || item.kind === 'conflict',
  );
  return hasSomethingMoreSpecific ? incoming.filter((item) => item.kind !== 'services') : incoming;
}

export function ChatWindow({
  businessName,
  maxMessageLength,
  manageToken,
  onClose,
}: {
  businessName: string;
  maxMessageLength: number;
  /** Present only when the customer arrived from their own booking link. */
  manageToken?: string | null;
  onClose: () => void;
}) {
  /**
   * Restored on the FIRST RENDER, not in an effect.
   *
   * An effect would paint the greeting and then replace it, and the customer
   * would watch their conversation flicker back into existence. This component
   * only ever mounts in the browser — ChatWidget renders it on a tap — so
   * reading storage during the initial state is safe and there is no server
   * render for it to disagree with.
   */
  const [restored] = useState(() => loadSession());

  const [turns, setTurns] = useState<ChatTurn[]>(
    () => restored?.turns ?? [{ role: 'assistant', content: GREETING }],
  );
  const [attachments, setAttachments] = useState<ChatAttachment[]>(
    () => restored?.attachments ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The id this conversation is recorded under, for the whole life of the tab.
   *
   * A ref rather than state: nothing renders from it, and it must not be
   * regenerated by a re-render — a new id mid-conversation would split one
   * conversation into two transcripts in Admin. Null when the browser cannot
   * mint a UUID, which means this session is simply not recorded.
   */
  const conversationId = useRef<string | null>(restored?.conversationId ?? newConversationId());
  /**
   * The slot the customer has chosen but not yet confirmed.
   *
   * Held here, not on the server and not in the conversation: until they press
   * confirm there is nothing to book and nobody to tell. Cleared the moment a
   * booking comes back, so the card cannot be confirmed twice.
   */
  const [pending, setPending] = useState<PendingBooking | null>(restored?.pending ?? null);

  const endRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns, attachments, busy]);

  // Saved after every change rather than on unmount: a phone browser discarding
  // a backgrounded tab does not run cleanup, and that is one of the two cases
  // this exists for.
  useEffect(() => {
    saveSession({ conversationId: conversationId.current, turns, attachments, pending });
  }, [turns, attachments, pending]);

  // A conversation left open while the customer walks away should not keep a
  // request alive behind them.
  useEffect(() => () => inFlight.current?.abort(), []);

  const send = useCallback(
    async (text: string, action?: unknown) => {
      if (busy) return;

      // The greeting is ours, not the model's — sending it back would have the
      // assistant treating its own hello as something the customer said.
      const history = [...turns].slice(1);
      const next: ChatTurn[] = [...turns, { role: 'user', content: text }];

      setTurns(next);
      setBusy(true);
      setError(null);

      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: text }].map((turn) => ({
              role: turn.role,
              content: turn.content,
            })),
            ...(action ? { action } : {}),
            // In the envelope, never in a message. See the route's header.
            ...(manageToken ? { manageToken } : {}),
            ...(conversationId.current ? { conversationId: conversationId.current } : {}),
          }),
        });

        const data = (await response.json()) as ChatResponse;
        setTurns((current) => [
          ...current,
          { role: 'assistant', content: data.reply, degraded: data.degraded },
        ]);
        setAttachments(withoutIncidentalMenu(data.attachments ?? []));
        // A booking came back: the pending card has done its job and must not
        // stay on screen offering to book the same slot again.
        if ((data.attachments ?? []).some((item) => item.kind === 'booking')) setPending(null);
      } catch (failure) {
        if ((failure as { name?: string })?.name === 'AbortError') return;
        // A silent failure reads as the assistant ignoring them.
        setError("That didn't send. Check your connection and try again.");
      } finally {
        setBusy(false);
        inFlight.current = null;
      }
    },
    [busy, turns, manageToken],
  );

  const services = attachments.find((item) => item.kind === 'services');
  const availability = attachments.find((item) => item.kind === 'availability');
  const conflict = attachments.find((item) => item.kind === 'conflict');
  const booking = attachments.find((item) => item.kind === 'booking') as
    | BookingAttachment
    | undefined;
  const showSuggestions = turns.length === 1 && !busy;

  return (
    <div
      role="dialog"
      aria-label={`Chat with ${businessName}`}
      className="fixed inset-0 z-50 flex flex-col bg-blush-50 sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(38rem,calc(100vh-3rem))] sm:w-[24rem] sm:rounded-2xl sm:border sm:border-blush-200 sm:shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-blush-200 px-4 py-3">
        {/* The mark instead of the studio's name in text, which the mark
            already carries. "Assistant" stays: the logo says whose this is,
            not what it is, and a panel that opens over the page should say
            what it is.

            The mark is decorative here on purpose. The dialog is already
            labelled "Chat with {businessName}", so titling the mark as well
            would read the studio's name out twice on the way in. */}
        <div className="flex items-center gap-2.5 text-aubergine-900">
          <SmartMark variant="compact" className="h-9 w-9 shrink-0 rounded-full" />
          <p className="text-[0.65rem] tracking-[0.22em] text-gilt-600 uppercase">Assistant</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full text-mauve-500 hover:bg-blush-100"
        >
          <span className="sr-only">Close chat</span>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* The conversation scrolls; the header and composer do not. */}
      <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {turns.map((turn, index) => (
          <ChatMessage key={index} turn={turn} bookUrl="/book" />
        ))}

        {!busy && services && (
          <ServiceCards
            attachment={services}
            disabled={busy}
            onChoose={(serviceId, name) =>
              void send(`I'm interested in the ${name}.`, { kind: 'service', serviceId })
            }
          />
        )}

        {!busy && availability && !pending && (
          <AvailabilityOptions
            attachment={availability}
            disabled={busy}
            onChoose={(option) => {
              // Choosing is not confirming. This only opens the summary card;
              // nothing is written until the button on it is pressed.
              setPending({
                serviceId: option.serviceId,
                serviceName: availability.serviceName,
                date: availability.date,
                time: option.label,
                startsAt: option.startsAt,
                staffId: option.staffId,
                staffName: option.staffName,
                price: option.price,
              });
              void send(`${option.label} please.`, {
                kind: 'slot',
                serviceId: option.serviceId,
                startsAt: option.startsAt,
                staffId: option.staffId,
              });
            }}
          />
        )}

        {/* The slot went while they were confirming. Same projection, so a
            tapped alternative behaves exactly like a first choice. */}
        {!busy && conflict && (
          <AvailabilityOptions
            attachment={{
              kind: 'availability',
              serviceId: conflict.serviceId,
              serviceName: conflict.serviceName,
              date: conflict.date,
              timezone: conflict.timezone,
              staffPinned: conflict.staffPinned,
              servicePrice: conflict.servicePrice,
              options: conflict.options,
            }}
            disabled={busy}
            onChoose={(option) => {
              setPending({
                serviceId: option.serviceId,
                serviceName: conflict.serviceName,
                date: conflict.date,
                time: option.label,
                startsAt: option.startsAt,
                staffId: option.staffId,
                staffName: option.staffName,
                price: option.price,
              });
              void send(`${option.label} instead please.`, {
                kind: 'slot',
                serviceId: option.serviceId,
                startsAt: option.startsAt,
                staffId: option.staffId,
              });
            }}
          />
        )}

        {!busy && pending && (
          <BookingSummary
            pending={pending}
            disabled={busy}
            onConfirm={(details) =>
              void send('Yes, please book that.', {
                kind: 'confirm_booking',
                serviceId: pending.serviceId,
                startsAt: pending.startsAt,
                staffId: pending.staffId,
                name: details.name,
                phone: details.phone,
                email: details.email,
                idempotencyKey: details.idempotencyKey,
              })
            }
          />
        )}

        {!busy && booking && <ManageLink attachment={booking} />}

        {showSuggestions && <SuggestionButtons disabled={busy} onPick={(text) => void send(text)} />}
        {busy && <ChatThinking />}
        {error && (
          <p role="alert" className="rounded-xl bg-lacquer-500/10 px-3 py-2 text-sm text-lacquer-600">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <ChatInput onSend={(text) => void send(text)} disabled={busy} maxLength={maxMessageLength} />
    </div>
  );
}

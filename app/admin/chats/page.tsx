import { getBusiness } from '@/lib/public-data';
import { requireOwner } from '@/lib/supabase/session';
import { recentConversations, retentionDays } from '@/lib/ai/transcript';
import { formatDateTimeLabel } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * What people asked the assistant.
 *
 * ---------------------------------------------------------------------------
 * THE QUESTION THIS SCREEN ANSWERS is "what are customers asking for that we
 * are not giving them?" — a treatment nobody offers, a time nobody works, a
 * price nobody published. So the list is ordered by recency, each row says
 * whether it ended in a booking, and the conversations that did NOT book are
 * the interesting ones. A transcript that ends in a booking is a success
 * already sitting in the diary.
 *
 * READ ONLY, AND DELIBERATELY SO. There is no delete button and no search box.
 * A delete button would imply the owner curating a record she is not the
 * subject of, and the retention window removes everything on its own. If a
 * customer asks to be forgotten, the erasure path takes their conversations
 * with their details — see `forgetCustomer`.
 *
 * NO SERVER ACTIONS, NO CLIENT COMPONENT. Expanding a transcript is `<details>`
 * doing what it has always done, so this whole screen ships no JavaScript.
 * ---------------------------------------------------------------------------
 */
export default async function ChatsPage() {
  await requireOwner();

  const business = (await getBusiness())!;
  const conversations = await recentConversations(business.id);
  const days = retentionDays();

  return (
    <div className="pt-6">
      <h1 className="font-display text-2xl font-semibold text-aubergine-900">Chats</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-mauve-500">
        What people asked the assistant on the website. Kept for {days} days, then deleted
        automatically.
      </p>

      {conversations.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-blush-100 px-4 py-6 text-center text-sm text-mauve-500">
          No conversations yet. They will appear here as people use the chat button on the site.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {conversations.map((conversation) => {
            // The opening line is what the owner scans for, so it is the one
            // thing shown before expanding. Falls back to the assistant's turn
            // in the odd case of a conversation that starts with an action tap.
            const opener =
              conversation.turns.find((turn) => turn.role === 'user')?.content ??
              conversation.turns[0]?.content ??
              '';

            return (
              <li key={conversation.id}>
                <details className="group rounded-2xl border border-blush-200 bg-white px-4 py-3 open:shadow-sm">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-mauve-400">
                        {formatDateTimeLabel(new Date(conversation.lastMessageAt), business.timezone)}
                      </span>
                      {conversation.booked && (
                        <span className="rounded-full bg-gilt-200/60 px-2 py-0.5 text-[0.65rem] font-medium tracking-wide text-aubergine-900 uppercase">
                          Booked
                        </span>
                      )}
                      <span className="ml-auto text-xs text-mauve-400">
                        {conversation.messageCount}{' '}
                        {conversation.messageCount === 1 ? 'message' : 'messages'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-aubergine-900 group-open:whitespace-normal">
                      {opener}
                    </p>
                    <span className="mt-1 inline-block text-xs text-lacquer-500 underline underline-offset-4 group-open:hidden">
                      Read the whole thing
                    </span>
                  </summary>

                  <div className="mt-3 space-y-2 border-t border-blush-100 pt-3">
                    {conversation.turns.map((turn, index) => (
                      <div
                        key={index}
                        className={
                          turn.role === 'user'
                            ? 'rounded-xl bg-blush-100 px-3 py-2'
                            : 'rounded-xl bg-blush-50 px-3 py-2'
                        }
                      >
                        <p className="text-[0.65rem] tracking-[0.18em] text-mauve-400 uppercase">
                          {turn.role === 'user' ? 'Customer' : 'Assistant'}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-aubergine-900">
                          {turn.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

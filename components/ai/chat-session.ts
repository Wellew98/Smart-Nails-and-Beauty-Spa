import type { ChatTurn } from './chat-message';
import type { PendingBooking } from './booking-summary';
import type { ChatAttachment } from '@/lib/ai/types';

/**
 * Keeping a conversation across a refresh, a closed panel, or a tab restored
 * from the background.
 *
 * ---------------------------------------------------------------------------
 * WHY sessionStorage AND NOT localStorage.
 *
 * The problem being solved is small and specific: the panel unmounts when it is
 * closed, and a phone browser reloads a backgrounded tab whenever it feels like
 * it. Either one used to throw away a conversation the customer was halfway
 * through, and they came back to the greeting. sessionStorage fixes exactly
 * that — it survives a reload and a close-and-reopen, and it dies with the tab.
 *
 * localStorage would survive more, and that is the reason not to use it. These
 * are phones, and phones get handed to other people. A chat about a wax
 * appointment reappearing for whoever opens the site next on the same handset
 * is a worse failure than losing a conversation, and it is the failure nobody
 * would think to test for.
 *
 * WHAT IS DELIBERATELY NOT SAVED: the name and phone number typed into the
 * confirmation card. `pending` is the slot, not the person — BookingSummary
 * holds those fields in its own state and they are gone with the unmount. A
 * customer's phone number is not written to disk to save them retyping it.
 * ---------------------------------------------------------------------------
 */

const STORAGE_KEY = 'smart.chat.v1';

/**
 * Enough to resume a real conversation, bounded so a very long one cannot
 * approach the storage quota. If it ever trips, the oldest turns go — the
 * customer sees a conversation that starts partway through, which is a great
 * deal better than one that does not come back.
 */
const MAX_SAVED_TURNS = 40;

/**
 * Drop from the MIDDLE, never from the front.
 *
 * ChatWindow's whole protocol depends on `turns[0]` being the greeting: it
 * slices it off before posting, because the greeting is the site's line and not
 * something the customer said. Trimming from the front would silently promote a
 * real customer message into that position, and the next turn would post the
 * conversation with that message missing. So the greeting is pinned and the
 * oldest real turns go instead.
 */
function trim(turns: ChatTurn[]): ChatTurn[] {
  if (turns.length <= MAX_SAVED_TURNS) return turns;
  return [turns[0], ...turns.slice(-(MAX_SAVED_TURNS - 1))];
}

export interface SavedSession {
  conversationId: string | null;
  turns: ChatTurn[];
  attachments: ChatAttachment[];
  pending: PendingBooking | null;
}

/**
 * The id this window's turns are recorded under, server-side.
 *
 * Returns null when the browser cannot mint a real UUID — an old browser, or a
 * page served over plain http, where `crypto.randomUUID` is not available. The
 * route validates this field as a UUID and would reject anything else, so
 * sending nothing is the only safe fallback: THE CHAT KEEPS WORKING AND THAT
 * SESSION IS SIMPLY NOT RECORDED. Never substitute a non-UUID here.
 */
export function newConversationId(): string | null {
  if (typeof crypto === 'undefined' || !('randomUUID' in crypto)) return null;
  return crypto.randomUUID();
}

export function loadSession(): SavedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    // A stored shape from an older build, or something hand-edited. Anything
    // unexpected starts a fresh conversation rather than rendering a broken one.
    if (!Array.isArray(parsed.turns) || parsed.turns.length === 0) return null;

    return {
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : null,
      turns: parsed.turns,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      pending: parsed.pending ?? null,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...session, turns: trim(session.turns) }),
    );
  } catch {
    // Quota, or storage disabled entirely (private mode on some browsers).
    // Resuming is a convenience; the conversation in memory is unaffected.
  }
}

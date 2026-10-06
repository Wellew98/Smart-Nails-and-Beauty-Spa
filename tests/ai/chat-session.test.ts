import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSession, newConversationId, saveSession } from '@/components/ai/chat-session';
import type { ChatTurn } from '@/components/ai/chat-message';

/**
 * Resuming a conversation from the browser's own storage.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THAT WOULD HAVE SHIPPED BROKEN.
 *
 * ChatWindow slices `turns[0]` off before posting, because the greeting is the
 * site's line and not something the customer said. Saving "the last N turns"
 * quietly breaks that: past the cap the greeting falls off the front, a real
 * customer message takes its place, and every subsequent turn is posted with
 * that message missing. The conversation still looks fine on screen. The model
 * is the only one that notices, and it notices by giving a worse answer.
 *
 * So the cap is tested at its boundary rather than assumed.
 *
 * No jsdom in this project — the storage this module talks to is four calls
 * wide, so it is stubbed here rather than pulling in a DOM for it.
 * ---------------------------------------------------------------------------
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const GREETING: ChatTurn = { role: 'assistant', content: 'Hi! I can help you find a treatment.' };

function conversation(realTurns: number): ChatTurn[] {
  return [
    GREETING,
    ...Array.from({ length: realTurns }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as ChatTurn['role'],
      content: `turn ${index}`,
    })),
  ];
}

describe('saving and restoring', () => {
  it('gives back exactly what went in', () => {
    const turns = conversation(4);
    saveSession({ conversationId: 'abc', turns, attachments: [], pending: null });

    const restored = loadSession();
    expect(restored?.turns).toEqual(turns);
    expect(restored?.conversationId).toBe('abc');
  });

  it('keeps the greeting at the front when the conversation outgrows the cap', () => {
    // 60 real turns against a cap of 40 — well past it.
    saveSession({
      conversationId: 'abc',
      turns: conversation(60),
      attachments: [],
      pending: null,
    });

    const restored = loadSession()!;
    expect(restored.turns).toHaveLength(40);
    // The invariant ChatWindow's `slice(1)` depends on.
    expect(restored.turns[0]).toEqual(GREETING);
    // And it is the OLDEST real turns that went, not the newest.
    expect(restored.turns.at(-1)).toEqual({ role: 'assistant', content: 'turn 59' });
    expect(restored.turns.map((turn) => turn.content)).not.toContain('turn 0');
  });

  it('starts a fresh conversation rather than rendering a corrupt one', () => {
    store.set('smart.chat.v1', '{ not json');
    expect(loadSession()).toBeNull();

    store.set('smart.chat.v1', JSON.stringify({ turns: 'nonsense' }));
    expect(loadSession()).toBeNull();

    // An empty transcript is indistinguishable from no transcript, and
    // restoring it would leave the panel with no greeting at all.
    store.set('smart.chat.v1', JSON.stringify({ turns: [] }));
    expect(loadSession()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('quota');
        },
      },
    };

    // Private browsing, or a full quota. Resuming is a convenience; losing it
    // must not take the conversation with it.
    expect(() => saveSession({ conversationId: null, turns: [GREETING], attachments: [], pending: null })).not.toThrow();
    expect(loadSession()).toBeNull();
  });
});

describe('the conversation id', () => {
  it('is a UUID, because the route validates it as one', () => {
    // Anything else would be rejected by the chat route's schema and would
    // take the whole conversation down with it, not just the recording.
    expect(newConversationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('is null rather than a fallback when the browser cannot mint one', () => {
    const realCrypto = globalThis.crypto;
    // http, or an old browser. `randomUUID` is absent and there is no safe
    // substitute — the only correct answer is to send nothing.
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      expect(newConversationId()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    }
  });
});

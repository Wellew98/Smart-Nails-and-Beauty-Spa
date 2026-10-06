import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, orchestrate } from '@/lib/ai/orchestrator';
import type { AIProvider } from '@/lib/ai/provider';
import type { AIResult, AITextResponse, AIToolCallResponse } from '@/lib/ai/types';
import { IDS, nextWorkingDate, resetDatabase } from '../helpers/fixtures';

/**
 * How long is everything that is NOT the model?
 *
 * `maxDuration` on the chat route has to be set above a real turn with
 * headroom, and the honest way to pick it is to measure the part that can be
 * measured here — the Postgres work and the orchestration around it — and be
 * explicit that the rest is the provider.
 *
 * This is an assertion, not a benchmark print-out, so it also acts as a guard:
 * if the availability turn's own cost ever grows by an order of magnitude,
 * something has started doing a query per slot and this fails rather than
 * quietly eating the budget the model needs.
 */

beforeEach(resetDatabase);

function instantProvider(script: { call?: string; args?: Record<string, unknown> }[]): AIProvider {
  let index = 0;
  return {
    name: 'gemini',
    model: 'measured',
    supportsToolCalling: () => true,
    async generateToolCall(): Promise<AIResult<AIToolCallResponse>> {
      const turn = script[index++];
      return turn?.call
        ? { ok: true, value: { text: null, toolCall: { name: turn.call, args: turn.args ?? {} } } }
        : { ok: true, value: { text: 'I found these times.', toolCall: null } };
    },
    async generateResponse(): Promise<AIResult<AITextResponse>> {
      return { ok: true, value: { text: 'I found these times.' } };
    },
  };
}

describe('the cost of a turn, excluding the provider', () => {
  it('is a small fraction of the turn budget', async () => {
    const date = nextWorkingDate();

    // The heaviest realistic shape: look up the menu, then check a day. A fresh
    // one per run — the script is consumed as it plays.
    const provider = () =>
      instantProvider([
        { call: 'get_services' },
        { call: 'check_availability', args: { service_id: IDS.service.fullBodyMassage, date } },
      ]);

    // One warm run so the pool and the query plans are not in the measurement.
    await orchestrate({
      businessId: IDS.business,
      provider: instantProvider([{ call: 'get_services' }]),
      messages: [{ role: 'user', content: 'warm' }],
    });

    const runs: number[] = [];
    for (let run = 0; run < 5; run++) {
      const started = performance.now();
      const result = await orchestrate({
        businessId: IDS.business,
        provider: provider(),
        messages: [{ role: 'user', content: `anything free on ${date}?` }],
      });
      runs.push(performance.now() - started);
      expect(result.attachments).toHaveLength(2);
    }

    const median = [...runs].sort((a, b) => a - b)[Math.floor(runs.length / 2)];

    // Reported in the batch write-up. Generous enough not to be flaky on a
    // loaded container, tight enough to catch a query-per-slot regression.
    expect(median).toBeLessThan(DEFAULT_LIMITS.turnBudgetMs / 10);

    if (process.env.AI_REPORT_LATENCY) {
      console.info(
        `[latency] availability turn, provider excluded: median ${median.toFixed(1)}ms of ${runs
          .map((value) => value.toFixed(1))
          .join(', ')}`,
      );
    }
  });
});

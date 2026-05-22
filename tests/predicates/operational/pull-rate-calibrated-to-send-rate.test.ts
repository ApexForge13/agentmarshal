import { describe, it, expect, beforeEach } from 'vitest';
import { pullRateCalibratedToSendRatePredicate } from '../../../lib/compliance/predicates/operational/pull-rate-calibrated-to-send-rate';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date('2026-05-22T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('operational pull_rate_calibrated_to_send_rate predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(pullRateCalibratedToSendRatePredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('pull_rate_calibrated_to_send_rate');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('pull_rate_calibrated_to_send_rate');
  });

  it('returns stub shape with COO-pipeline deferred_to anchor', async () => {
    const result = await pullRateCalibratedToSendRatePredicate.evaluate(
      { pull_date: '2026-05-22' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('pull_rate_calibrated_to_send_rate');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.pull_date).toBe('2026-05-22');
    expect(result.details.deferred_to).toBe('COO pipeline controller integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'pull_rate_calibrated_to_send_rate', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

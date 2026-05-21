import { describe, it, expect, beforeEach } from 'vitest';
import { unsubscribeMechanismPredicate } from '../../../lib/compliance/predicates/canspam/unsubscribe-mechanism';
import {
  registerComposite,
  clearComposites,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date('2026-05-21T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('CAN-SPAM unsubscribe-mechanism predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(unsubscribeMechanismPredicate);
  });

  it('returns stub shape with deferred reason', async () => {
    const result = await unsubscribeMechanismPredicate.evaluate(
      { unsubscribe_url: 'https://example.com/u/42' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('canspam_unsubscribe_mechanism_working');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.would_check).toBe('endpoint_responds_200_for_30_days');
  });

  it('isAllowable returns false when the mechanism stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'canspam_unsubscribe_mechanism_working', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

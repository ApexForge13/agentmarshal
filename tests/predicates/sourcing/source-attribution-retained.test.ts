import { describe, it, expect, beforeEach } from 'vitest';
import { sourceAttributionRetainedPredicate } from '../../../lib/compliance/predicates/sourcing/source-attribution-retained';
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
    now: new Date('2026-05-21T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('sourcing source_attribution_retained predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(sourceAttributionRetainedPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('source_attribution_retained');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('source_attribution_retained');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await sourceAttributionRetainedPredicate.evaluate(
      { lead_id: 'lead-xyz-789' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('source_attribution_retained');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.lead_id).toBe('lead-xyz-789');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'source_attribution_retained', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

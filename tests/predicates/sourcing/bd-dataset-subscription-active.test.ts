import { describe, it, expect, beforeEach } from 'vitest';
import { bdDatasetSubscriptionActivePredicate } from '../../../lib/compliance/predicates/sourcing/bd-dataset-subscription-active';
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

describe('sourcing bd_dataset_subscription_active predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdDatasetSubscriptionActivePredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('bd_dataset_subscription_active');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('bd_dataset_subscription_active');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await bdDatasetSubscriptionActivePredicate.evaluate(
      { dataset_id: 'linkedin_company' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('bd_dataset_subscription_active');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.dataset_id).toBe('linkedin_company');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'bd_dataset_subscription_active', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

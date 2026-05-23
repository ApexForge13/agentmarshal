import { describe, it, expect, beforeEach } from 'vitest';
import { dataAcquisitionTosCompliantPredicate } from '../../../lib/compliance/predicates/sourcing/data-acquisition-tos-compliant';
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

describe('sourcing data_acquisition_tos_compliant predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(dataAcquisitionTosCompliantPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('data_acquisition_tos_compliant');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('data_acquisition_tos_compliant');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await dataAcquisitionTosCompliantPredicate.evaluate(
      {
        source_url: 'https://example.com/contractor-directory',
        acquisition_method: 'direct_scrape',
      },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('data_acquisition_tos_compliant');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.acquisition_method).toBe('direct_scrape');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'data_acquisition_tos_compliant', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

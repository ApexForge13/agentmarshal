import { describe, it, expect, beforeEach } from 'vitest';
import { dataSourceProvenanceRecordedPredicate } from '../../../lib/compliance/predicates/sourcing/data-source-provenance-recorded';
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

describe('sourcing data_source_provenance_recorded predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(dataSourceProvenanceRecordedPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('data_source_provenance_recorded');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('data_source_provenance_recorded');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await dataSourceProvenanceRecordedPredicate.evaluate(
      { lead_id: 'lead-abc-123' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('data_source_provenance_recorded');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.lead_id).toBe('lead-abc-123');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'data_source_provenance_recorded', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

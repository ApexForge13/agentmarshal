import { describe, it, expect, beforeEach } from 'vitest';
import { piiFieldHandlingDocumentedPredicate } from '../../../lib/compliance/predicates/sourcing/pii-field-handling-documented';
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

describe('sourcing pii_field_handling_documented predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(piiFieldHandlingDocumentedPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('pii_field_handling_documented');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('pii_field_handling_documented');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await piiFieldHandlingDocumentedPredicate.evaluate(
      { field_name: 'email' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('pii_field_handling_documented');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.field_name).toBe('email');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'pii_field_handling_documented', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

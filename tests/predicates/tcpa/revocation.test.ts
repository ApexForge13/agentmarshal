import { describe, it, expect, beforeEach } from 'vitest';
import { revocationPredicate } from '../../../lib/compliance/predicates/tcpa/revocation';
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

describe('TCPA revocation predicate (Bubble 1a stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(revocationPredicate);
  });

  it('returns stub shape with predicate name and deferred reason', async () => {
    const result = await revocationPredicate.evaluate(
      { recipient_phone: '+14045551234' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('tcpa_revocation_honored');
    expect(result.reason).toMatch(/not yet implemented/i);
  });

  it('isAllowable returns false when the revocation stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'tcpa_revocation_honored', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

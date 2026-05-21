import { describe, it, expect, beforeEach } from 'vitest';
import { dncRegistryPredicate } from '../../../lib/compliance/predicates/tcpa/dnc-registry';
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

describe('TCPA DNC registry predicate (Bubble 1a stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(dncRegistryPredicate);
  });

  it('returns stub result with correct shape', async () => {
    const result = await dncRegistryPredicate.evaluate(
      { recipient_phone: '+14045551234' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('tcpa_dnc_registry_clear');
    expect(result.reason).toMatch(/not yet implemented/i);
  });

  it('details.would_check references donotcall.gov for the supplied phone', async () => {
    const result = await dncRegistryPredicate.evaluate(
      { recipient_phone: '+14045551234' },
      makeCtx(),
    );
    expect(result.details.would_check).toMatch(/donotcall\.gov/);
    expect(result.details.recipient_phone).toBe('+14045551234');
  });

  it('isAllowable returns false when the DNC stub result is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'tcpa_dnc_registry_clear', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

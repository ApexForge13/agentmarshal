import { describe, it, expect, beforeEach } from 'vitest';
import { complaintRateCompliantPredicate } from '../../../lib/compliance/predicates/operational/complaint-rate-compliant';
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

describe('operational complaint_rate_compliant predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(complaintRateCompliantPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('complaint_rate_compliant');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('complaint_rate_compliant');
  });

  it('returns stub shape with InboxAllocator-metrics deferred_to anchor', async () => {
    const result = await complaintRateCompliantPredicate.evaluate(
      { sender_id: 'ses-003' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('complaint_rate_compliant');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.sender_id).toBe('ses-003');
    expect(result.details.deferred_to).toBe('InboxAllocator metrics integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'complaint_rate_compliant', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

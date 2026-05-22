import { describe, it, expect, beforeEach } from 'vitest';
import { inboxSendCapacityAboveFloorPredicate } from '../../../lib/compliance/predicates/operational/inbox-send-capacity-above-floor';
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

describe('operational inbox_send_capacity_above_floor predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(inboxSendCapacityAboveFloorPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('inbox_send_capacity_above_floor');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('inbox_send_capacity_above_floor');
  });

  it('returns stub shape with InboxAllocator-metrics deferred_to anchor', async () => {
    const result = await inboxSendCapacityAboveFloorPredicate.evaluate(
      { target_send_count: 2000 },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('inbox_send_capacity_above_floor');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.target_send_count).toBe(2000);
    expect(result.details.deferred_to).toBe('InboxAllocator metrics integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'inbox_send_capacity_above_floor', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

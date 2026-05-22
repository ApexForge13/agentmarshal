import { describe, it, expect, beforeEach } from 'vitest';
import { pipelineBufferWithinTargetBandPredicate } from '../../../lib/compliance/predicates/operational/pipeline-buffer-within-target-band';
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

describe('operational pipeline_buffer_within_target_band predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(pipelineBufferWithinTargetBandPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('pipeline_buffer_within_target_band');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('pipeline_buffer_within_target_band');
  });

  it('returns stub shape with COO-pipeline deferred_to anchor', async () => {
    const result = await pipelineBufferWithinTargetBandPredicate.evaluate(
      { planned_send_count: 1500 },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('pipeline_buffer_within_target_band');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.planned_send_count).toBe(1500);
    expect(result.details.deferred_to).toBe('COO pipeline controller integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'pipeline_buffer_within_target_band', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

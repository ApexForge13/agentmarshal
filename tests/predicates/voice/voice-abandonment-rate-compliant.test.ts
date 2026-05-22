import { describe, it, expect, beforeEach } from 'vitest';
import { voiceAbandonmentRateCompliantPredicate } from '../../../lib/compliance/predicates/voice/voice-abandonment-rate-compliant';
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

describe('voice voice_abandonment_rate_compliant predicate (Bubble 3 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(voiceAbandonmentRateCompliantPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('voice_abandonment_rate_compliant');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('voice_abandonment_rate_compliant');
  });

  it('returns stub shape with Voice-agent deferred_to anchor', async () => {
    const result = await voiceAbandonmentRateCompliantPredicate.evaluate(
      { voice_agent_id: 'vapi-agent-roofing-01' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('voice_abandonment_rate_compliant');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.voice_agent_id).toBe('vapi-agent-roofing-01');
    expect(result.details.deferred_to).toBe('Voice agent integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'voice_abandonment_rate_compliant', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

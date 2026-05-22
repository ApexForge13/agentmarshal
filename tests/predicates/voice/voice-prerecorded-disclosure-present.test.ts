import { describe, it, expect, beforeEach } from 'vitest';
import { voicePrerecordedDisclosurePresentPredicate } from '../../../lib/compliance/predicates/voice/voice-prerecorded-disclosure-present';
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

describe('voice voice_prerecorded_disclosure_present predicate (Bubble 3 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(voicePrerecordedDisclosurePresentPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('voice_prerecorded_disclosure_present');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('voice_prerecorded_disclosure_present');
  });

  it('returns stub shape with Voice-agent deferred_to anchor (runtime complement to tcpa_robocall_disclosure_present)', async () => {
    const result = await voicePrerecordedDisclosurePresentPredicate.evaluate(
      { call_id: 'call-abc-002' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('voice_prerecorded_disclosure_present');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.call_id).toBe('call-abc-002');
    expect(result.details.deferred_to).toBe('Voice agent integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      {
        predicate: 'voice_prerecorded_disclosure_present',
        result: 'stub',
        reason: '',
        details: {},
      },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

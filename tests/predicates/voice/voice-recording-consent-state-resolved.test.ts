import { describe, it, expect, beforeEach } from 'vitest';
import { voiceRecordingConsentStateResolvedPredicate } from '../../../lib/compliance/predicates/voice/voice-recording-consent-state-resolved';
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

describe('voice voice_recording_consent_state_resolved predicate (Bubble 3 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(voiceRecordingConsentStateResolvedPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('voice_recording_consent_state_resolved');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('voice_recording_consent_state_resolved');
  });

  it('returns stub shape with Voice-agent deferred_to anchor', async () => {
    const result = await voiceRecordingConsentStateResolvedPredicate.evaluate(
      { caller_state: 'TX', call_id: 'call-abc-001' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('voice_recording_consent_state_resolved');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.caller_state).toBe('TX');
    expect(result.details.call_id).toBe('call-abc-001');
    expect(result.details.deferred_to).toBe('Voice agent integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      {
        predicate: 'voice_recording_consent_state_resolved',
        result: 'stub',
        reason: '',
        details: {},
      },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

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

function makeCtx(actionProperties?: Record<string, unknown>): EvalContext {
  return {
    now: new Date('2026-05-23T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'voice-001',
    request_id: 'r',
    audit: NULL_EMITTER,
    action_properties: actionProperties,
  };
}

const INPUT = { caller_state: 'TX', call_id: 'call-123' };

describe('voice voice_recording_consent_state_resolved predicate (Bubble 9 real)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(voiceRecordingConsentStateResolvedPredicate);
  });

  it('registers under the expected name', () => {
    const p = getComposite('voice_recording_consent_state_resolved');
    expect(p).toBeDefined();
    expect(p?.name).toBe('voice_recording_consent_state_resolved');
  });

  it("returns 'fail' when consent is revoked (the consent-revocation arc)", async () => {
    const result = await voiceRecordingConsentStateResolvedPredicate.evaluate(
      INPUT,
      makeCtx({ consent_status: 'revoked' }),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/revoked/i);
    expect(result.details.consent_status).toBe('revoked');
    expect(result.details.call_id).toBe('call-123');
    expect(result.details.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/revoked/i)]),
    );
  });

  it("returns 'pass' for granted, and for unknown/absent (v0.2 one-party default)", async () => {
    const granted = await voiceRecordingConsentStateResolvedPredicate.evaluate(
      INPUT,
      makeCtx({ consent_status: 'granted' }),
    );
    expect(granted.result).toBe('pass');
    expect(granted.details.consent_status).toBe('granted');

    const unknown = await voiceRecordingConsentStateResolvedPredicate.evaluate(
      INPUT,
      makeCtx({ consent_status: 'unknown' }),
    );
    expect(unknown.result).toBe('pass');
    expect(unknown.details.unknown_treated_as_consent).toBe(true);

    // Absent action_properties (no consent supplied) is treated as unknown → pass.
    const absent = await voiceRecordingConsentStateResolvedPredicate.evaluate(INPUT, makeCtx());
    expect(absent.result).toBe('pass');
    expect(absent.details.consent_status).toBe('unknown');

    // Live request-time call_id/caller_state override the contract placeholders.
    const live = await voiceRecordingConsentStateResolvedPredicate.evaluate(
      INPUT,
      makeCtx({ consent_status: 'granted', call_id: 'live-call', caller_state: 'CA' }),
    );
    expect(live.details.call_id).toBe('live-call');
    expect(live.details.caller_state).toBe('CA');
  });

  it('isAllowable rejects a trace containing the revoked-consent fail', () => {
    const passEvals: CompositePredicateEvaluation[] = [
      { predicate: 'voice_recording_consent_state_resolved', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(passEvals)).toBe(true);
    const failEvals: CompositePredicateEvaluation[] = [
      { predicate: 'voice_recording_consent_state_resolved', result: 'fail', reason: '', details: {} },
    ];
    expect(isAllowable(failEvals)).toBe(false);
  });
});

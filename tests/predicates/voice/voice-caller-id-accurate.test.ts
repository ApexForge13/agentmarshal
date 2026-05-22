import { describe, it, expect, beforeEach } from 'vitest';
import { voiceCallerIdAccuratePredicate } from '../../../lib/compliance/predicates/voice/voice-caller-id-accurate';
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

describe('voice voice_caller_id_accurate predicate (Bubble 3 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(voiceCallerIdAccuratePredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('voice_caller_id_accurate');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('voice_caller_id_accurate');
  });

  it('returns stub shape with Voice-agent deferred_to anchor (runtime complement to tcpa_caller_id_disclosed)', async () => {
    const result = await voiceCallerIdAccuratePredicate.evaluate(
      { call_id: 'call-abc-003' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('voice_caller_id_accurate');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.call_id).toBe('call-abc-003');
    expect(result.details.deferred_to).toBe('Voice agent integration');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'voice_caller_id_accurate', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

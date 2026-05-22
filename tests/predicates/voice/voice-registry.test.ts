import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllVoiceComposites } from '../../../lib/compliance/predicates/voice';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'voice_recording_consent_state_resolved',
  'voice_abandonment_rate_compliant',
  'voice_prerecorded_disclosure_present',
  'voice_caller_id_accurate',
];

describe('voice composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllVoiceComposites populates 4 entries in the registry', () => {
    registerAllVoiceComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(4);
  });

  it('each voice predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllVoiceComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('any voice stub in the trace blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'stub', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `stub for ${name} should block allow`).toBe(false);
    }
  });
});

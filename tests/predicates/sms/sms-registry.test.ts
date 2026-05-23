import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllSmsComposites } from '../../../lib/compliance/predicates/sms';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = ['sms_express_written_consent_recorded'];

describe('sms composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllSmsComposites populates 1 entry in the registry', () => {
    registerAllSmsComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(1);
  });

  it('each sms predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllSmsComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('any sms stub in the trace blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'stub', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `stub for ${name} should block allow`).toBe(false);
    }
  });
});

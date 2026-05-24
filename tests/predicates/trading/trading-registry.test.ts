import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllTradingComposites } from '../../../lib/compliance/predicates/trading';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = ['entity_not_sanctioned'];

describe('trading composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllTradingComposites populates 1 entry in the registry', () => {
    registerAllTradingComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(1);
  });

  it('each trading predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllTradingComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('an unresolved trading stub in the trace blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'stub', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `stub for ${name} should block allow`).toBe(false);
    }
  });
});

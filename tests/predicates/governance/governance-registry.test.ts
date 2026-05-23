import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllGovernanceComposites } from '../../../lib/compliance/predicates/governance';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'cross_tenant_isolation_enforced',
  'action_scope_within_contract',
  'spend_within_cap',
  'agent_role_authorized_for_action',
  'input_injection_pattern_clear',
];

describe('governance composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllGovernanceComposites populates 5 entries in the registry', () => {
    registerAllGovernanceComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(5);
  });

  it('each governance predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllGovernanceComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('a fail result on any governance predicate blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'fail', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `fail for ${name} should block allow`).toBe(false);
    }
  });
});

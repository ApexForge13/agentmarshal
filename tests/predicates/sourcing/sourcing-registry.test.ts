import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllSourcingComposites } from '../../../lib/compliance/predicates/sourcing';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'data_source_provenance_recorded',
  'bd_dataset_subscription_active',
  'bd_proxy_session_logged',
  'data_acquisition_tos_compliant',
  'pii_field_handling_documented',
  'source_robots_txt_honored',
  'source_public_record_status_verified',
  'source_attribution_retained',
];

describe('sourcing composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllSourcingComposites populates 8 entries in the registry', () => {
    registerAllSourcingComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(8);
  });

  it('each sourcing predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllSourcingComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('any sourcing stub in the trace blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'stub', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `stub for ${name} should block allow`).toBe(false);
    }
  });
});

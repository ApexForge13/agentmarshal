import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllOperationalComposites } from '../../../lib/compliance/predicates/operational';
import {
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'sender_reputation_above_threshold',
  'bounce_rate_compliant',
  'complaint_rate_compliant',
  'inbox_send_capacity_above_floor',
  'pipeline_buffer_within_target_band',
  'pull_rate_calibrated_to_send_rate',
  'scrape_budget_within_monthly_cap',
];

describe('operational composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllOperationalComposites populates 7 entries in the registry', () => {
    registerAllOperationalComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(7);
  });

  it('each operational predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllOperationalComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });

  it('any operational stub in the trace blocks isAllowable', () => {
    for (const name of EXPECTED_NAMES) {
      const evals: CompositePredicateEvaluation[] = [
        { predicate: name, result: 'stub', reason: '', details: {} },
      ];
      expect(isAllowable(evals), `stub for ${name} should block allow`).toBe(false);
    }
  });
});

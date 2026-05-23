import { describe, it, expect, beforeEach } from 'vitest';
import { spendWithinCapPredicate } from '../../../lib/compliance/predicates/governance/spend-within-cap';
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
    now: new Date('2026-05-23T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('governance spend_within_cap predicate (Bubble 8a real)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(spendWithinCapPredicate);
  });

  it('registers the composite predicate by name', () => {
    const p = getComposite('spend_within_cap');
    expect(p).toBeDefined();
    expect(p?.name).toBe('spend_within_cap');
  });

  it("returns 'pass' when projected spend is within the effective ceiling (default 10% margin)", async () => {
    const result = await spendWithinCapPredicate.evaluate(
      { projected_spend_usd: 50, monthly_cap_usd: 1000 },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.projected_spend_usd).toBe(50);
    expect(result.details.effective_ceiling_usd).toBeCloseTo(900);
  });

  it("returns 'fail' when projected spend exceeds the effective ceiling", async () => {
    const result = await spendWithinCapPredicate.evaluate(
      { projected_spend_usd: 950, monthly_cap_usd: 1000 },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/exceeds effective ceiling/);
    expect(result.details.projected_spend_usd).toBe(950);
    expect(result.details.monthly_cap_usd).toBe(1000);
    expect(result.details.safety_margin_pct).toBe(10);
    expect(result.details.effective_ceiling_usd).toBeCloseTo(900);
  });

  it('isAllowable accepts pass-only trace and rejects fail-containing trace', () => {
    const passEvals: CompositePredicateEvaluation[] = [
      { predicate: 'spend_within_cap', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(passEvals)).toBe(true);
    const failEvals: CompositePredicateEvaluation[] = [
      { predicate: 'spend_within_cap', result: 'fail', reason: '', details: {} },
    ];
    expect(isAllowable(failEvals)).toBe(false);
  });
});

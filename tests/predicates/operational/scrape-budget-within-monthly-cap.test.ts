import { describe, it, expect, beforeEach } from 'vitest';
import { scrapeBudgetWithinMonthlyCapPredicate } from '../../../lib/compliance/predicates/operational/scrape-budget-within-monthly-cap';
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

describe('operational scrape_budget_within_monthly_cap predicate (Bubble 2 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(scrapeBudgetWithinMonthlyCapPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('scrape_budget_within_monthly_cap');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('scrape_budget_within_monthly_cap');
  });

  it('returns stub shape with Bright-Data deferred_to anchor', async () => {
    const result = await scrapeBudgetWithinMonthlyCapPredicate.evaluate(
      { projected_spend_usd: 25 },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('scrape_budget_within_monthly_cap');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.projected_spend_usd).toBe(25);
    expect(result.details.deferred_to).toBe('Bright Data integration day');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'scrape_budget_within_monthly_cap', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

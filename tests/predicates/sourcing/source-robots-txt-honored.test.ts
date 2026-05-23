import { describe, it, expect, beforeEach } from 'vitest';
import { sourceRobotsTxtHonoredPredicate } from '../../../lib/compliance/predicates/sourcing/source-robots-txt-honored';
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
    now: new Date('2026-05-21T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('sourcing source_robots_txt_honored predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(sourceRobotsTxtHonoredPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('source_robots_txt_honored');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('source_robots_txt_honored');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await sourceRobotsTxtHonoredPredicate.evaluate(
      { source_url: 'https://example.com/contractors' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('source_robots_txt_honored');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.source_url).toBe('https://example.com/contractors');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'source_robots_txt_honored', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});

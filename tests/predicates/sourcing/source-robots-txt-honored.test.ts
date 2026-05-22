import { describe, it, expect, beforeEach } from 'vitest';
import { sourceRobotsTxtHonoredPredicate } from '../../../lib/compliance/predicates/sourcing/source-robots-txt-honored';
import {
  registerComposite,
  clearComposites,
  getComposite,
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

  it('registers and returns stub shape with deferred reason', async () => {
    expect(getComposite('source_robots_txt_honored')).toBeDefined();
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
});

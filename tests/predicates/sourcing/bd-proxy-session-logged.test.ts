import { describe, it, expect, beforeEach } from 'vitest';
import { bdProxySessionLoggedPredicate } from '../../../lib/compliance/predicates/sourcing/bd-proxy-session-logged';
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

describe('sourcing bd_proxy_session_logged predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdProxySessionLoggedPredicate);
  });

  it('registers and returns stub shape with deferred reason', async () => {
    expect(getComposite('bd_proxy_session_logged')).toBeDefined();
    const result = await bdProxySessionLoggedPredicate.evaluate(
      { session_id: 'bd-session-9f3c' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('bd_proxy_session_logged');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.session_id).toBe('bd-session-9f3c');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });
});

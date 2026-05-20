import { describe, it, expect } from 'vitest';
import { callerIdPredicate } from '../../../lib/compliance/predicates/tcpa/caller-id';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date(),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('TCPA caller-id predicate', () => {
  it('passes when caller_phone is present in E.164', async () => {
    const result = await callerIdPredicate.evaluate(
      { caller_phone: '+14045551234' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
  });

  it('fails when both caller_phone and caller_display_name are missing', async () => {
    const result = await callerIdPredicate.evaluate({}, makeCtx());
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/caller identification required/i);
  });

  it('passes when caller_display_name is present without phone', async () => {
    const result = await callerIdPredicate.evaluate(
      { caller_display_name: 'EchoOS - Acme Roofing' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.has_display_name).toBe(true);
    expect(result.details.has_phone).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { bdDomainInScopePredicate } from '@/lib/compliance/predicates/bd/bd_domain_in_scope';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
} from '@/lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';

function makeCtx(action_properties?: Record<string, unknown>): EvalContext {
  return {
    now: new Date('2026-05-27T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
    action_properties,
  };
}

const MATCHED_RULE = {
  rule_id: 'adverse_media_unlock',
  match: {
    service: 'web_unlocker',
    parameters: {
      purpose: { equals: 'adverse_media_unlock' },
      url: { domain_in: ['*.reuters.com', '*.ft.com'] },
    },
  },
  decision: 'permit',
};

function ctxWith(url: unknown, rule: unknown = MATCHED_RULE): EvalContext {
  return makeCtx({
    bd_call: { service: 'web_unlocker', parameters: { url } },
    bd_matched_rule: rule,
  });
}

describe('bd_domain_in_scope composite (Bubble 18)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdDomainInScopePredicate);
  });

  it('registers by name', () => {
    expect(getComposite('bd_domain_in_scope')?.name).toBe('bd_domain_in_scope');
  });

  it('PASS — hostname matches a *.domain wildcard', async () => {
    const r = await bdDomainInScopePredicate.evaluate({}, ctxWith('https://www.reuters.com/article/x'));
    expect(r.result).toBe('pass');
    expect(r.details.hostname).toBe('www.reuters.com');
    expect(isAllowable([r])).toBe(true);
  });

  it('FAIL — hostname not in the allowlist', async () => {
    const r = await bdDomainInScopePredicate.evaluate({}, ctxWith('https://evil.example.com/x'));
    expect(r.result).toBe('fail');
    expect(r.reason).toBe('hostname evil.example.com not in declared domain_in allowlist');
    expect(isAllowable([r])).toBe(false);
  });

  it('STUB — url parameter absent (unresolved input)', async () => {
    const r = await bdDomainInScopePredicate.evaluate(
      {},
      makeCtx({ bd_call: { service: 'web_unlocker', parameters: {} }, bd_matched_rule: MATCHED_RULE }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_call.parameters.url');
    expect(isAllowable([r])).toBe(false);
  });

  it('FAIL — url parameter is not a parseable URL', async () => {
    const r = await bdDomainInScopePredicate.evaluate({}, ctxWith('not a url'));
    expect(r.result).toBe('fail');
    expect(r.reason).toBe('url parameter is not a valid URL');
    expect(isAllowable([r])).toBe(false);
  });

  it('FAIL — apex domain does not match a *.wildcard (subdomains only)', async () => {
    const r = await bdDomainInScopePredicate.evaluate({}, ctxWith('https://reuters.com/x'));
    expect(r.result).toBe('fail');
  });

  it('STUB — matched rule carries no domain_in allowlist (unresolved input)', async () => {
    const r = await bdDomainInScopePredicate.evaluate(
      {},
      ctxWith('https://www.reuters.com/x', {
        rule_id: 'x',
        match: { service: 'web_unlocker', parameters: { purpose: { equals: 'adverse_media_unlock' } } },
        decision: 'permit',
      }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_matched_rule.match.parameters.url.domain_in');
  });
});

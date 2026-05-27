import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { governMCPCall, matchBdRule } from '@/lib/mcp/govern';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import type { ScopeContract, BDPermissionRule, BDPermissionMatch } from '@/types/authzen';
// govern.ts side-effect-registers the BD composites; explicit import for clarity.
import '@/lib/compliance/predicates/bd';

const ADVERSE_MEDIA_RULE: BDPermissionRule = {
  rule_id: 'adverse_media_serp',
  match: {
    service: 'serp_api',
    tool: 'search_google',
    parameters: { purpose: { equals: 'adverse_media_screening' } },
  },
  composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches'],
  decision: 'permit',
};

function contractWith(rules: BDPermissionRule[]): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'govern-test',
    agent_id: 'agentmarshal:contract/govern-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-26T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

describe('matchBdRule (Bubble 17)', () => {
  it('matches on service + tool + equals purpose', () => {
    expect(
      matchBdRule(ADVERSE_MEDIA_RULE.match, {
        service: 'serp_api',
        tool: 'search_google',
        parameters: { purpose: 'adverse_media_screening' },
      }),
    ).toBe(true);
  });

  it('rejects a different service / tool / equals value', () => {
    const call = { tool: 'search_google', parameters: { purpose: 'adverse_media_screening' } };
    expect(matchBdRule(ADVERSE_MEDIA_RULE.match, { service: 'web_unlocker', ...call })).toBe(false);
    expect(
      matchBdRule(ADVERSE_MEDIA_RULE.match, { service: 'serp_api', tool: 'other', parameters: call.parameters }),
    ).toBe(false);
    expect(
      matchBdRule(ADVERSE_MEDIA_RULE.match, {
        service: 'serp_api',
        tool: 'search_google',
        parameters: { purpose: 'price_scraping' },
      }),
    ).toBe(false);
  });

  it('in operator', () => {
    const m: BDPermissionMatch = { service: 'serp_api', parameters: { country: { in: ['us', 'gb'] } } };
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: { country: 'us' } })).toBe(true);
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: { country: 'fr' } })).toBe(false);
  });

  it('exists operator', () => {
    const m: BDPermissionMatch = { service: 'serp_api', parameters: { query: { exists: true } } };
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: { query: 'x' } })).toBe(true);
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: {} })).toBe(false);
  });

  it('matches (regex) operator', () => {
    const m: BDPermissionMatch = { service: 'serp_api', parameters: { query: { matches: '^acme' } } };
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: { query: 'acme corp' } })).toBe(true);
    expect(matchBdRule(m, { service: 'serp_api', tool: 't', parameters: { query: 'zzz' } })).toBe(false);
  });

  it('domain_in operator (URL hostname, wildcard + apex)', () => {
    const m: BDPermissionMatch = { service: 'web_unlocker', parameters: { url: { domain_in: ['*.reuters.com'] } } };
    expect(matchBdRule(m, { service: 'web_unlocker', tool: 't', parameters: { url: 'https://www.reuters.com/x' } })).toBe(true);
    expect(matchBdRule(m, { service: 'web_unlocker', tool: 't', parameters: { url: 'https://reuters.com/x' } })).toBe(true);
    expect(matchBdRule(m, { service: 'web_unlocker', tool: 't', parameters: { url: 'https://evil.com' } })).toBe(false);
    expect(matchBdRule(m, { service: 'web_unlocker', tool: 't', parameters: { url: 'not a url' } })).toBe(false);
  });
});

describe('governMCPCall (Bubble 17)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — matching rule + passing composites', async () => {
    setContractOverride('agent-x', contractWith([ADVERSE_MEDIA_RULE]));
    const r = await governMCPCall({
      agent_id: 'agent-x',
      service: 'serp_api',
      tool: 'search_google',
      parameters: { query: 'acme corp fraud', purpose: 'adverse_media_screening' },
    });
    expect(r.permit).toBe(true);
    expect(r.matched_rule_id).toBe('adverse_media_serp');
    expect(r.composite_outcomes.map((o) => o.result)).toEqual(['pass', 'pass']);
  });

  it('DENY no_matching_rule — service not covered by any rule', async () => {
    setContractOverride('agent-x', contractWith([ADVERSE_MEDIA_RULE]));
    const r = await governMCPCall({
      agent_id: 'agent-x',
      service: 'web_unlocker',
      tool: 'unlock',
      parameters: { purpose: 'adverse_media_screening' },
    });
    expect(r.permit).toBe(false);
    expect(r.reason).toBe('no_matching_rule');
    expect(r.matched_rule_id).toBeNull();
  });

  it('DENY no_matching_rule — contract has no bd_permissions', async () => {
    setContractOverride('agent-x', contractWith([]));
    const r = await governMCPCall({
      agent_id: 'agent-x',
      service: 'serp_api',
      tool: 'search_google',
      parameters: { query: 'x', purpose: 'adverse_media_screening' },
    });
    expect(r.permit).toBe(false);
    expect(r.reason).toBe('no_matching_rule');
  });

  it('DENY (fail-closed) — matched rule names an unknown composite', async () => {
    const rule: BDPermissionRule = {
      rule_id: 'r_unknown',
      match: { service: 'serp_api' },
      composite_checks: ['does_not_exist'],
      decision: 'permit',
    };
    setContractOverride('agent-x', contractWith([rule]));
    const r = await governMCPCall({
      agent_id: 'agent-x',
      service: 'serp_api',
      tool: 'search_google',
      parameters: { query: 'x' },
    });
    expect(r.permit).toBe(false);
    expect(r.matched_rule_id).toBe('r_unknown');
    expect(r.reason).toMatch(/unknown composite/);
  });

  it('DENY — matched rule but a composite is unresolved (stub blocks)', async () => {
    // Rule matches on service alone, so a call without a purpose still matches; the
    // purpose composite then can't resolve the declared purpose → stub → not allowable.
    const rule: BDPermissionRule = {
      rule_id: 'r_purpose',
      match: { service: 'serp_api' },
      composite_checks: ['bd_query_purpose_matches'],
      decision: 'permit',
    };
    setContractOverride('agent-x', contractWith([rule]));
    const r = await governMCPCall({
      agent_id: 'agent-x',
      service: 'serp_api',
      tool: 'search_google',
      parameters: { query: 'x' },
    });
    expect(r.permit).toBe(false);
    expect(r.matched_rule_id).toBe('r_purpose');
    expect(r.composite_outcomes[0].result).toBe('stub');
  });
});

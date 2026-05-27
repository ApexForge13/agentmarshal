import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runUnlockNewsArticle } from '@/lib/mcp/unlocker-tool';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { ScopeContract, BDPermissionRule } from '@/types/authzen';
import type { BdContentFetchResult } from '@/lib/bd/types';
import '@/lib/compliance/predicates/bd';

const RULE: BDPermissionRule = {
  rule_id: 'adverse_media_unlock',
  match: {
    service: 'web_unlocker',
    tool: 'unlock_url',
    parameters: {
      purpose: { equals: 'adverse_media_unlock' },
      url: { domain_in: ['*.reuters.com', '*.ft.com'] },
    },
  },
  composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches', 'bd_domain_in_scope'],
  decision: 'permit',
};

function contractWith(rules: BDPermissionRule[]): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'unlocker-tool-test',
    agent_id: 'agentmarshal:contract/unlocker-tool-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-27T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const RAW = '<html><body><h1>Reuters: Acme Corp under investigation</h1></body></html>';
function okUnlock(): BdContentFetchResult {
  return { results: { content: RAW }, raw: RAW, bd_request_id: 'req-unlock', status: 200 };
}

const ARGS = {
  agent_id: 'agent-x',
  url: 'https://www.reuters.com/legal/acme-probe',
  purpose: 'adverse_media_unlock',
};

describe('runUnlockNewsArticle (Bubble 18)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — governs (3 composites pass), executes, fingerprints into a permit bd_call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const unlock = vi.fn(async () => okUnlock());
    const out = await runUnlockNewsArticle(ARGS, { unlock: unlock as never });

    expect(out.ok).toBe(true);
    expect(out.denied).toBe(false);
    expect(out.results?.content).toBe(RAW);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith({ url: ARGS.url });

    const c = out.bd_call;
    expect(c.service).toBe('web_unlocker');
    expect(c.tool).toBe('unlock_url');
    expect(c.governance_result).toBe('permit');
    expect(c.matched_rule_id).toBe('adverse_media_unlock');
    expect(c.composite_outcomes).toEqual([
      { composite: 'bd_service_authorized', result: 'pass' },
      { composite: 'bd_query_purpose_matches', result: 'pass' },
      { composite: 'bd_domain_in_scope', result: 'pass' },
    ]);
    expect(c.response_sha256).toBe(sha256Hex(Buffer.from(RAW, 'utf-8')));
    expect(c.response_size_bytes).toBe(Buffer.byteLength(RAW, 'utf-8'));
    expect(c.bd_request_id).toBe('req-unlock');
    expect(typeof c.executed_at).toBe('string');
  });

  it('DENY — no bd_permissions rule; BD call never made', async () => {
    setContractOverride('agent-x', contractWith([]));
    const unlock = vi.fn(async () => okUnlock());
    const out = await runUnlockNewsArticle(ARGS, { unlock: unlock as never });

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(true);
    expect(out.results).toBeNull();
    expect(unlock).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
    expect(out.bd_call.response_sha256).toBeNull();
  });

  it('DENY — url outside the domain allowlist does not match the rule; BD call never made', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const unlock = vi.fn(async () => okUnlock());
    const out = await runUnlockNewsArticle(
      { ...ARGS, url: 'https://evil.example.com/fake' },
      { unlock: unlock as never },
    );

    expect(out.denied).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
    expect(out.bd_call.matched_rule_id).toBeNull();
  });

  it('permitted but BD execution fails — records attempt, ok:false, no fingerprint', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const unlock = vi.fn(async () => {
      throw new Error('upstream blocked');
    });
    const out = await runUnlockNewsArticle(ARGS, { unlock: unlock as never });

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(false);
    expect(out.reason).toMatch(/BD Web Unlocker call failed/);
    expect(out.bd_call.governance_result).toBe('permit');
    expect(out.bd_call.response_sha256).toBeNull();
    expect(typeof out.bd_call.executed_at).toBe('string');
  });
});

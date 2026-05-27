import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runSerpAdverseMediaSearch } from '@/lib/mcp/serp-tool';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { ScopeContract, BDPermissionRule } from '@/types/authzen';
import type { BdSerpSearchResult } from '@/lib/bd/types';
import '@/lib/compliance/predicates/bd';

const RULE: BDPermissionRule = {
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
    contract_id: 'serp-tool-test',
    agent_id: 'agentmarshal:contract/serp-tool-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-26T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const RAW = '{"general":{"query":"acme"},"organic":[{"rank":1,"title":"Acme news"}]}';
function okSerp(): BdSerpSearchResult {
  return { results: JSON.parse(RAW), raw: RAW, bd_request_id: 'req-xyz', status: 200 };
}

describe('runSerpAdverseMediaSearch (Bubble 17)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — governs, executes, fingerprints into a permit bd_call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const serp = vi.fn(async () => okSerp());
    const out = await runSerpAdverseMediaSearch(
      { agent_id: 'agent-x', query: 'acme corp fraud' },
      { serp: serp as never },
    );

    expect(out.ok).toBe(true);
    expect(out.denied).toBe(false);
    expect(out.results?.organic?.[0]?.title).toBe('Acme news');
    expect(serp).toHaveBeenCalledTimes(1);

    const c = out.bd_call;
    expect(c.governance_result).toBe('permit');
    expect(c.matched_rule_id).toBe('adverse_media_serp');
    expect(c.composite_outcomes).toEqual([
      { composite: 'bd_service_authorized', result: 'pass' },
      { composite: 'bd_query_purpose_matches', result: 'pass' },
    ]);
    expect(c.response_sha256).toBe(sha256Hex(Buffer.from(RAW, 'utf-8')));
    expect(c.response_size_bytes).toBe(Buffer.byteLength(RAW, 'utf-8'));
    expect(c.bd_request_id).toBe('req-xyz');
    expect(typeof c.executed_at).toBe('string');
  });

  it('DENY — no matching bd_permissions rule; BD call never made', async () => {
    setContractOverride('agent-x', contractWith([]));
    const serp = vi.fn(async () => okSerp());
    const out = await runSerpAdverseMediaSearch(
      { agent_id: 'agent-x', query: 'acme' },
      { serp: serp as never },
    );

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(true);
    expect(out.results).toBeNull();
    expect(serp).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
    expect(out.bd_call.response_sha256).toBeNull();
    expect(out.bd_call.executed_at).toBeNull();
  });

  it('permitted but BD execution fails — records attempt, ok:false, no fingerprint', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const serp = vi.fn(async () => {
      throw new Error('upstream blocked');
    });
    const out = await runSerpAdverseMediaSearch(
      { agent_id: 'agent-x', query: 'acme' },
      { serp: serp as never },
    );

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(false);
    expect(out.reason).toMatch(/BD SERP call failed/);
    expect(out.bd_call.governance_result).toBe('permit');
    expect(out.bd_call.response_sha256).toBeNull();
    expect(typeof out.bd_call.executed_at).toBe('string');
  });
});

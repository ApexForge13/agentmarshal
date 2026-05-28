import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runBdMcpPassthrough } from '@/lib/mcp/passthrough-tool';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { ScopeContract, BDPermissionRule } from '@/types/authzen';
import type { BdMcpPassthroughResult } from '@/lib/bd/mcp-passthrough-client';
import '@/lib/compliance/predicates/bd';

const RULE: BDPermissionRule = {
  rule_id: 'bd_mcp_governed_passthrough',
  match: {
    service: 'mcp_server',
    tool: 'bd_mcp_passthrough',
    parameters: {
      purpose: { equals: 'mcp_passthrough' },
      bd_tool_name: { in: ['search_engine', 'scrape_as_markdown'] },
    },
  },
  composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches', 'bd_passthrough_tool_in_allowlist'],
  decision: 'permit',
};

function contractWith(rules: BDPermissionRule[]): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'passthrough-tool-test',
    agent_id: 'agentmarshal:contract/passthrough-tool-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-27T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const RAW = JSON.stringify({ content: [{ type: 'text', text: 'serp results for acme' }] });
function okPassthrough(): BdMcpPassthroughResult {
  return { results: JSON.parse(RAW), raw: RAW, bd_request_id: null, status: 200 };
}

const ARGS = {
  agent_id: 'agent-x',
  bd_tool_name: 'search_engine',
  bd_tool_input: { query: 'acme corp' },
  purpose: 'mcp_passthrough',
};

describe('runBdMcpPassthrough (Bubble 20)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — governs (3 composites pass), forwards, fingerprints into a permit bd_call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const passthrough = vi.fn(async () => okPassthrough());
    const out = await runBdMcpPassthrough(ARGS, { passthrough: passthrough as never });

    expect(out.ok).toBe(true);
    expect(out.denied).toBe(false);
    expect(passthrough).toHaveBeenCalledWith({ bd_tool_name: 'search_engine', bd_tool_input: { query: 'acme corp' } });

    const c = out.bd_call;
    expect(c.service).toBe('mcp_server');
    expect(c.tool).toBe('bd_mcp_passthrough');
    expect(c.parameters.bd_tool_name).toBe('search_engine');
    expect(c.governance_result).toBe('permit');
    expect(c.matched_rule_id).toBe('bd_mcp_governed_passthrough');
    expect(c.composite_outcomes).toEqual([
      { composite: 'bd_service_authorized', result: 'pass' },
      { composite: 'bd_query_purpose_matches', result: 'pass' },
      { composite: 'bd_passthrough_tool_in_allowlist', result: 'pass' },
    ]);
    expect(c.response_sha256).toBe(sha256Hex(Buffer.from(RAW, 'utf-8')));
  });

  it('DENY — bd_tool_name outside the allowlist does not match the rule; no BD call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const passthrough = vi.fn(async () => okPassthrough());
    const out = await runBdMcpPassthrough(
      { ...ARGS, bd_tool_name: 'ask_brightdata_assistant' },
      { passthrough: passthrough as never },
    );

    expect(out.denied).toBe(true);
    expect(passthrough).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
    expect(out.bd_call.matched_rule_id).toBeNull();
  });

  it('DENY — no bd_permissions rule; no BD call', async () => {
    setContractOverride('agent-x', contractWith([]));
    const passthrough = vi.fn(async () => okPassthrough());
    const out = await runBdMcpPassthrough(ARGS, { passthrough: passthrough as never });
    expect(out.denied).toBe(true);
    expect(passthrough).not.toHaveBeenCalled();
  });

  it('permitted but BD execution fails — records attempt, ok:false, no fingerprint', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const passthrough = vi.fn(async () => {
      throw new Error('mcp transport closed');
    });
    const out = await runBdMcpPassthrough(ARGS, { passthrough: passthrough as never });

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(false);
    expect(out.reason).toMatch(/BD MCP passthrough call failed/);
    expect(out.bd_call.governance_result).toBe('permit');
    expect(out.bd_call.response_sha256).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { bdPassthroughToolInAllowlistPredicate } from '@/lib/compliance/predicates/bd/bd_passthrough_tool_in_allowlist';
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
  rule_id: 'bd_mcp_governed_passthrough',
  match: {
    service: 'mcp_server',
    tool: 'bd_mcp_passthrough',
    parameters: {
      purpose: { equals: 'mcp_passthrough' },
      bd_tool_name: { in: ['search_engine', 'scrape_as_markdown'] },
    },
  },
  decision: 'permit',
};

function ctxWith(toolName: unknown, rule: unknown = MATCHED_RULE): EvalContext {
  return makeCtx({
    bd_call: { service: 'mcp_server', parameters: { bd_tool_name: toolName } },
    bd_matched_rule: rule,
  });
}

describe('bd_passthrough_tool_in_allowlist composite (Bubble 20)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdPassthroughToolInAllowlistPredicate);
  });

  it('registers by name', () => {
    expect(getComposite('bd_passthrough_tool_in_allowlist')?.name).toBe('bd_passthrough_tool_in_allowlist');
  });

  it('PASS — bd_tool_name is in the allowlist', async () => {
    const r = await bdPassthroughToolInAllowlistPredicate.evaluate({}, ctxWith('search_engine'));
    expect(r.result).toBe('pass');
    expect(r.details.bd_tool_name).toBe('search_engine');
    expect(isAllowable([r])).toBe(true);
  });

  it('FAIL — bd_tool_name not in the allowlist', async () => {
    const r = await bdPassthroughToolInAllowlistPredicate.evaluate({}, ctxWith('ask_brightdata_assistant'));
    expect(r.result).toBe('fail');
    expect(r.reason).toBe('BD MCP tool ask_brightdata_assistant is not in the passthrough allowlist');
    expect(isAllowable([r])).toBe(false);
  });

  it('STUB — bd_tool_name absent (unresolved input)', async () => {
    const r = await bdPassthroughToolInAllowlistPredicate.evaluate(
      {},
      makeCtx({ bd_call: { service: 'mcp_server', parameters: {} }, bd_matched_rule: MATCHED_RULE }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_call.parameters.bd_tool_name');
  });

  it('STUB — matched rule carries no bd_tool_name allowlist (unresolved input)', async () => {
    const r = await bdPassthroughToolInAllowlistPredicate.evaluate(
      {},
      ctxWith('search_engine', {
        rule_id: 'x',
        match: { service: 'mcp_server', parameters: { purpose: { equals: 'mcp_passthrough' } } },
        decision: 'permit',
      }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_matched_rule.match.parameters.bd_tool_name.in');
  });
});

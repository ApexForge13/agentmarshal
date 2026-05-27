// Verifies the MCP SDK wiring (registerTool with zod 4, the Web-standard Streamable
// HTTP transport in stateless JSON mode) — exactly the path app/api/mcp/v1/route.ts
// drives. A fresh server+transport per request, as the route does. No real BD calls
// (deny path needs none; permit path injects a mock serp).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAgentMarshalMcpServer } from '@/lib/mcp/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
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
    contract_id: 'mcp-server-test',
    agent_id: 'agentmarshal:contract/mcp-server-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-26T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const RAW = '{"organic":[{"rank":1,"title":"Acme news"}]}';

// Drive one JSON-RPC message through a fresh server+transport, exactly as the route does.
async function rpc(
  body: unknown,
  deps: Parameters<typeof createAgentMarshalMcpServer>[0] = {},
): Promise<{ status: number; json: any }> {
  const server = createAgentMarshalMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const req = new Request('http://localhost/api/mcp/v1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
  const res = await transport.handleRequest(req);
  return { status: res.status, json: JSON.parse(await res.text()) };
}

describe('AgentMarshal MCP server over Streamable HTTP (Bubble 17)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('tools/list advertises serp_adverse_media_search with an input schema', async () => {
    const { json } = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const names = (json.result?.tools ?? []).map((t: { name: string }) => t.name);
    expect(names).toContain('serp_adverse_media_search');
    const tool = json.result.tools.find((t: { name: string }) => t.name === 'serp_adverse_media_search');
    expect(tool.inputSchema?.properties?.query).toBeDefined();
    expect(tool.inputSchema?.properties?.agent_id).toBeDefined();
  });

  it('tools/call → governance DENY returns an MCP error result with a deny bd_call', async () => {
    setContractOverride('mcp-agent', contractWith([])); // no bd_permissions
    const { json } = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'serp_adverse_media_search', arguments: { agent_id: 'mcp-agent', query: 'acme' } },
    });
    expect(json.result.isError).toBe(true);
    expect(json.result.structuredContent.bd_call.governance_result).toBe('deny');
  });

  it('tools/call → governance PERMIT runs the (mocked) BD call and returns a permit bd_call', async () => {
    setContractOverride('mcp-agent', contractWith([RULE]));
    const serp = vi.fn(
      async (): Promise<BdSerpSearchResult> => ({
        results: JSON.parse(RAW),
        raw: RAW,
        bd_request_id: 'req-1',
        status: 200,
      }),
    );
    const { json } = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'serp_adverse_media_search', arguments: { agent_id: 'mcp-agent', query: 'acme corp fraud' } },
      },
      { serp: serp as never },
    );
    expect(serp).toHaveBeenCalledTimes(1);
    expect(json.result.isError).toBeFalsy();
    expect(json.result.structuredContent.bd_call.governance_result).toBe('permit');
    expect(json.result.structuredContent.bd_call.response_sha256).toBeTruthy();
  });
});

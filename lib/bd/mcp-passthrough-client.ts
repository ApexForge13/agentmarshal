// Bright Data MCP Server passthrough client (Bubble 20 Phase B).
//
// AgentMarshal positions itself as a governance layer over BD's HOSTED MCP server
// (https://mcp.brightdata.com/mcp). A single generic passthrough forwards an MCP
// tools/call to BD AFTER the Scope Contract governs it, so any tool BD adds to its MCP
// catalog is auto-governed without code changes here.
//
// Transport: MCP Streamable HTTP via the official SDK client. Auth: the existing
// BRIGHTDATA_API_TOKEN, passed as the `token` QUERY PARAM (BD's hosted-MCP scheme, NOT
// an Authorization: Bearer header). `connect` is injectable so unit tests run
// hermetically without a real MCP connection.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BdConfigError } from './client';

const BD_MCP_ENDPOINT = 'https://mcp.brightdata.com/mcp';

/** Minimal session surface the passthrough uses; the SDK Client satisfies it. */
export interface BdMcpSession {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  close(): Promise<void>;
}

export type BdMcpConnect = () => Promise<BdMcpSession>;

export interface BdMcpPassthroughParams {
  /** The Bright Data MCP tool to invoke (e.g. 'search_engine'). */
  bd_tool_name: string;
  /** Arguments forwarded verbatim to the BD MCP tool. */
  bd_tool_input?: Record<string, unknown>;
}

export interface BdMcpPassthroughResult {
  /** BD's MCP tool result (content / structuredContent / isError). */
  results: unknown;
  /** JSON-serialized result — the fingerprint substrate (the SDK abstracts wire bytes). */
  raw: string;
  bd_request_id: string | null;
  status: number;
}

/** Default connect: opens an SDK client to BD's hosted MCP over Streamable HTTP. */
const defaultConnect: BdMcpConnect = async () => {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new BdConfigError('BRIGHTDATA_API_TOKEN is not set');
  const url = new URL(BD_MCP_ENDPOINT);
  url.searchParams.set('token', token);
  const client = new Client({ name: 'agentmarshal-bd-proxy', version: '0.2.0' });
  await client.connect(new StreamableHTTPClientTransport(url));
  return {
    callTool: (params) => client.callTool(params),
    listTools: () => client.listTools(),
    close: () => client.close(),
  };
};

/**
 * Forwards one MCP tools/call to BD's hosted MCP server. Throws BdConfigError when the
 * token is missing (before any connection). `connect` is injectable for hermetic tests.
 */
export async function bdMcpPassthroughCall(
  params: BdMcpPassthroughParams,
  connect: BdMcpConnect = defaultConnect,
): Promise<BdMcpPassthroughResult> {
  const session = await connect();
  try {
    const results = await session.callTool({
      name: params.bd_tool_name,
      arguments: params.bd_tool_input ?? {},
    });
    return { results, raw: JSON.stringify(results), bd_request_id: null, status: 200 };
  } finally {
    await session.close();
  }
}

/** Lists BD's MCP tool catalog (metadata; used by the gated live round-trip test). */
export async function bdMcpListTools(connect: BdMcpConnect = defaultConnect): Promise<string[]> {
  const session = await connect();
  try {
    const { tools } = await session.listTools();
    return tools.map((t) => t.name);
  } finally {
    await session.close();
  }
}

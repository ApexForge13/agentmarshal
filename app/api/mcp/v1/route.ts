// MCP endpoint — Streamable HTTP transport (current MCP spec; replaces deprecated SSE).
//
// Agents point their MCP client at /api/mcp/v1. We run the AgentMarshal MCP server
// here, evaluate every BD tool call against the agent's Scope Contract bd_permissions,
// and forward approved calls to Bright Data. The SDK's WebStandardStreamableHTTPServerTransport
// speaks the Web Fetch Request/Response API, so it maps directly onto a Next.js App
// Router handler (no Node req/res bridging). Stateless mode + JSON responses: a fresh
// server+transport per request, no session store (sufficient for Bubble 17's
// request/response tools; resumable streaming lands later if needed).

import { createAgentMarshalMcpServer } from '@/lib/mcp/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const server = createAgentMarshalMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // single JSON response per request, no SSE stream
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

// Stateless mode exposes no standalone server→client SSE stream; clients drive
// everything over POST. Advertise POST-only for GET/DELETE.
export async function GET(): Promise<Response> {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE(): Promise<Response> {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

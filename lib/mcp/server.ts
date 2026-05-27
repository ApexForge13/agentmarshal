// AgentMarshal MCP server (Bubble 17).
//
// Stands up an @modelcontextprotocol/sdk McpServer and registers the first BD
// tool, serp_adverse_media_search. The tool's governance + execution logic lives
// in ./serp-tool (transport-agnostic, unit-tested); this module is the thin MCP
// protocol surface. The Streamable HTTP transport is wired in app/api/mcp/v1/route.ts.
//
// A fresh server is created per request (stateless transport), so createAgentMarshalMcpServer
// takes optional deps for test injection.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runSerpAdverseMediaSearch, type SerpToolDeps } from './serp-tool';

export function createAgentMarshalMcpServer(deps: SerpToolDeps = {}): McpServer {
  const server = new McpServer({
    name: 'agentmarshal-bd-proxy',
    version: '0.2.0',
  });

  server.registerTool(
    'serp_adverse_media_search',
    {
      title: 'SERP adverse-media search (governed)',
      description:
        "Runs a Bright Data SERP search for counterparty adverse media, gated by the agent's Scope Contract bd_permissions. Returns the parsed results plus a bd_call audit entry (governance decision, composite outcomes, response fingerprint) suitable for a signed receipt.",
      inputSchema: {
        agent_id: z
          .string()
          .describe('Agent identity whose Scope Contract governs this call (subject.id or type name).'),
        query: z.string().describe('Search query — counterparty name plus financial-crime keywords.'),
        num_results: z.number().int().positive().optional().describe('Maximum results to request.'),
        subject_type: z
          .string()
          .optional()
          .describe('Optional subject.type for the agent-contract-map type-name fallback.'),
      },
    },
    async (args) => {
      const result = await runSerpAdverseMediaSearch(
        {
          agent_id: args.agent_id,
          query: args.query,
          num_results: args.num_results,
          subject_type: args.subject_type,
        },
        deps,
      );

      if (result.denied) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Denied by Scope Contract bd_permissions: ${result.reason ?? 'no matching rule'}`,
            },
          ],
          structuredContent: { bd_call: result.bd_call },
        };
      }

      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.reason ?? 'BD SERP call failed' }],
          structuredContent: { bd_call: result.bd_call },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ bd_call: result.bd_call, results: result.results }),
          },
        ],
        structuredContent: { bd_call: result.bd_call, results: result.results },
      };
    },
  );

  return server;
}

// AgentMarshal MCP server (Bubble 17 SERP; Bubble 18 Web Unlocker + Crawl API).
//
// Stands up an @modelcontextprotocol/sdk McpServer and registers the governed BD
// tools: serp_adverse_media_search, unlock_news_article, crawl_article_content. Each
// tool's governance + execution logic lives in its own transport-agnostic, unit-tested
// module (./serp-tool, ./unlocker-tool, ./crawl-tool); this module is the thin MCP
// protocol surface. The Streamable HTTP transport is wired in app/api/mcp/v1/route.ts.
//
// A fresh server is created per request (stateless transport), so createAgentMarshalMcpServer
// takes optional deps for test injection.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runSerpAdverseMediaSearch, type SerpToolDeps } from './serp-tool';
import { runUnlockNewsArticle, type UnlockerToolDeps } from './unlocker-tool';
import { runCrawlArticleContent, type CrawlToolDeps } from './crawl-tool';
import type { BDCallAudit } from '@/types/authzen';

/** Combined tool deps — each tool runner reads only its own injected client. */
export type McpServerDeps = SerpToolDeps & UnlockerToolDeps & CrawlToolDeps;

/** Maps a governed tool result (deny / exec-fail / success) onto an MCP tool result. */
function toMcpResult(result: {
  ok: boolean;
  denied: boolean;
  reason: string | null;
  bd_call: BDCallAudit;
  results: unknown;
}) {
  if (result.denied) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `Denied by Scope Contract bd_permissions: ${result.reason ?? 'no matching rule'}`,
        },
      ],
      structuredContent: { bd_call: result.bd_call },
    };
  }
  if (!result.ok) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: result.reason ?? 'BD call failed' }],
      structuredContent: { bd_call: result.bd_call },
    };
  }
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify({ bd_call: result.bd_call, results: result.results }) },
    ],
    structuredContent: { bd_call: result.bd_call, results: result.results },
  };
}

export function createAgentMarshalMcpServer(deps: McpServerDeps = {}): McpServer {
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

  server.registerTool(
    'unlock_news_article',
    {
      title: 'Unlock paywalled news article (governed)',
      description:
        "Fetches a paywalled or anti-bot financial-news article via the Bright Data Web Unlocker, gated by the agent's Scope Contract bd_permissions (service + declared purpose + URL domain allowlist). Returns the unlocked HTML content plus a bd_call audit entry (governance decision, composite outcomes, response fingerprint) suitable for a signed receipt.",
      inputSchema: {
        agent_id: z
          .string()
          .describe('Agent identity whose Scope Contract governs this call (subject.id or type name).'),
        url: z
          .string()
          .describe('Absolute article URL to unlock; must fall under the matched rule\'s domain_in allowlist.'),
        purpose: z
          .enum(['adverse_media_unlock'])
          .describe('Declared purpose; must equal the purpose the matched bd_permissions rule authorizes.'),
        subject_type: z
          .string()
          .optional()
          .describe('Optional subject.type for the agent-contract-map type-name fallback.'),
      },
    },
    async (args) => {
      const result = await runUnlockNewsArticle(
        {
          agent_id: args.agent_id,
          url: args.url,
          purpose: args.purpose,
          subject_type: args.subject_type,
        },
        deps,
      );
      return toMcpResult(result);
    },
  );

  server.registerTool(
    'crawl_article_content',
    {
      title: 'Crawl + extract article content (governed)',
      description:
        "Extracts clean article content (markdown/text) from a URL via the Bright Data Crawl API — typically chained after a SERP search to read discovered adverse-media articles. Gated by the agent's Scope Contract bd_permissions. Returns the extracted items plus a bd_call audit entry suitable for a signed receipt.",
      inputSchema: {
        agent_id: z
          .string()
          .describe('Agent identity whose Scope Contract governs this call (subject.id or type name).'),
        url: z.string().describe('Absolute URL to extract clean content from (e.g. a SERP-discovered article).'),
        purpose: z
          .enum(['adverse_media_extract'])
          .describe('Declared purpose; must equal the purpose the matched bd_permissions rule authorizes.'),
        subject_type: z
          .string()
          .optional()
          .describe('Optional subject.type for the agent-contract-map type-name fallback.'),
      },
    },
    async (args) => {
      const result = await runCrawlArticleContent(
        {
          agent_id: args.agent_id,
          url: args.url,
          purpose: args.purpose,
          subject_type: args.subject_type,
        },
        deps,
      );
      return toMcpResult(result);
    },
  );

  return server;
}

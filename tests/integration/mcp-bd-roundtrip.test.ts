// End-to-end MCP ↔ Bright Data SERP round-trip against the REAL BD API.
//
// Gated by credentials: skipped unless BOTH BRIGHTDATA_API_TOKEN and
// BRIGHTDATA_SERP_ZONE are set in the process env. `npx vitest run` does not load
// .env, so this skips by default. To run it:
//
//   set -a; . ./.env; set +a; npx vitest run tests/integration/mcp-bd-roundtrip.test.ts
//
// NOTE (Bubble 17): the seeded BRIGHTDATA_SERP_ZONE must be a real SERP API zone.
// A Datacenter/ISP proxy zone is blocked by BD for google.com (policy_20110) — the
// governance still permits, but the live call fails and this test surfaces why.

import { describe, it, expect } from 'vitest';
import { runSerpAdverseMediaSearch } from '@/lib/mcp/serp-tool';
import { runUnlockNewsArticle } from '@/lib/mcp/unlocker-tool';
import { runCrawlArticleContent } from '@/lib/mcp/crawl-tool';

const HAS_BD_CREDS =
  !!process.env.BRIGHTDATA_API_TOKEN && !!process.env.BRIGHTDATA_SERP_ZONE;
const HAS_UNLOCKER =
  !!process.env.BRIGHTDATA_API_TOKEN && !!process.env.BRIGHTDATA_UNLOCKER_ZONE;
const HAS_CRAWL =
  !!process.env.BRIGHTDATA_API_TOKEN && !!process.env.BRIGHTDATA_CRAWL_DATASET_ID;

describe.skipIf(!HAS_BD_CREDS)(
  'MCP ↔ BD SERP round-trip (real BD, gated by BRIGHTDATA_API_TOKEN)',
  () => {
    it('TradingAgent serp_adverse_media_search permits, calls BD, and fingerprints the response', async () => {
      // agent_id 'TradingAgent' resolves to trading_v2 via the agent-contract map.
      const out = await runSerpAdverseMediaSearch({
        agent_id: 'TradingAgent',
        query: 'agentmarshal test',
        num_results: 1,
      });

      // Governance permits regardless of the live call outcome.
      expect(out.bd_call.governance_result).toBe('permit');
      expect(out.bd_call.matched_rule_id).toBe('adverse_media_serp');
      expect(out.bd_call.composite_outcomes).toEqual([
        { composite: 'bd_service_authorized', result: 'pass' },
        { composite: 'bd_query_purpose_matches', result: 'pass' },
      ]);

      if (!out.ok) {
        // Permitted but the live call failed — surface the reason so the gated run
        // is actionable (most likely: BRIGHTDATA_SERP_ZONE is not a SERP API zone).
        throw new Error(`BD SERP call did not succeed: ${out.reason}`);
      }

      // Real response captured + fingerprinted into the bd_call.
      expect(out.results).not.toBeNull();
      expect(out.bd_call.response_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(out.bd_call.response_size_bytes).toBeGreaterThan(0);
      expect(typeof out.bd_call.executed_at).toBe('string');
    });
  },
);

describe.skipIf(!HAS_UNLOCKER)(
  'MCP ↔ BD Web Unlocker round-trip (real BD, gated by BRIGHTDATA_UNLOCKER_ZONE)',
  () => {
    it('TradingAgent unlock_news_article permits a reuters.com fetch, runs domain_in scope, fingerprints', async () => {
      const out = await runUnlockNewsArticle({
        agent_id: 'TradingAgent',
        url: 'https://www.reuters.com/',
        purpose: 'adverse_media_unlock',
      });

      expect(out.bd_call.governance_result).toBe('permit');
      expect(out.bd_call.matched_rule_id).toBe('adverse_media_unlock');
      expect(out.bd_call.composite_outcomes).toEqual([
        { composite: 'bd_service_authorized', result: 'pass' },
        { composite: 'bd_query_purpose_matches', result: 'pass' },
        { composite: 'bd_domain_in_scope', result: 'pass' },
      ]);

      if (!out.ok) {
        throw new Error(`Web Unlocker call did not succeed: ${out.reason}`);
      }

      expect((out.results?.content.length ?? 0) > 0).toBe(true);
      expect(out.bd_call.response_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(out.bd_call.response_size_bytes).toBeGreaterThan(0);
    }, 30000);
  },
);

describe.skipIf(!HAS_CRAWL)(
  'MCP ↔ BD Crawl API round-trip (real BD, gated by BRIGHTDATA_CRAWL_DATASET_ID)',
  () => {
    it('TradingAgent crawl_article_content permits an example.com extract and fingerprints it', async () => {
      const out = await runCrawlArticleContent({
        agent_id: 'TradingAgent',
        url: 'https://example.com',
        purpose: 'adverse_media_extract',
      });

      expect(out.bd_call.governance_result).toBe('permit');
      expect(out.bd_call.matched_rule_id).toBe('adverse_media_extract');
      expect(out.bd_call.composite_outcomes).toEqual([
        { composite: 'bd_service_authorized', result: 'pass' },
        { composite: 'bd_query_purpose_matches', result: 'pass' },
      ]);

      if (!out.ok) {
        throw new Error(`Crawl API call did not succeed: ${out.reason}`);
      }

      expect((out.results?.items.length ?? 0) > 0).toBe(true);
      expect(out.bd_call.response_sha256).toMatch(/^[a-f0-9]{64}$/);
    }, 30000);
  },
);

// Live end-to-end verification of entity_adverse_media_check (v1) against the REAL
// Bright Data API (Bubble 19). Gated on BRIGHTDATA_API_TOKEN + BRIGHTDATA_SERP_ZONE +
// BRIGHTDATA_CRAWL_DATASET_ID, so `npx vitest run` stays hermetic. To run it:
//
//   set -a; . ./.env; set +a; npx vitest run tests/integration/entity-adverse-media-live.test.ts
//
// Drives the composite directly (the governed SERP→Crawl chain resolves the agent's
// trading_v2 contract via subject.type) against a fictional, benign counterparty.
//
// We assert the DETERMINISTIC parts: the governed chain ran (SERP + up to N Crawl
// calls, each permitted and response-fingerprinted) and produced a real scored verdict
// (not the best-effort skip/unavailable path). We do NOT pin the pass/review/fail
// VALUE: keyword scoring is heuristic in v1 and live SERP results drift — the same
// fictional name can score `pass` one run and `fail` the next as the query surfaces
// unrelated crime coverage. That false-positive tendency is the documented v1 limit;
// LLM-based interpretation (v0.3) is the fix. The verdict is logged for visibility.

import { describe, it, expect } from 'vitest';
import { entityAdverseMediaCheckPredicate } from '@/lib/compliance/predicates/trading/entity-adverse-media-check';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';
import type { BDCallAudit } from '@/types/authzen';

const HAS_FULL_CHAIN =
  !!process.env.BRIGHTDATA_API_TOKEN &&
  !!process.env.BRIGHTDATA_SERP_ZONE &&
  !!process.env.BRIGHTDATA_CRAWL_DATASET_ID;

// Fictional, benign counterparty — not a real person or company.
const FICTIONAL_COUNTERPARTY = 'Northwind Artisanal Stationery Collective';

describe.skipIf(!HAS_FULL_CHAIN)(
  'entity_adverse_media_check v1 — live SERP→Crawl chain (gated by BD creds)',
  () => {
    it('runs the governed SERP→Crawl chain and scores live content with a fingerprinted audit trail', async () => {
      const bdCalls: BDCallAudit[] = [];
      const ctx: EvalContext = {
        now: new Date(),
        tenant_id: 'default',
        agent_id: 'trading_v2',
        request_id: 'live-test',
        audit: NULL_EMITTER,
        action_properties: { entity: { id: FICTIONAL_COUNTERPARTY } },
        subject: { id: 'TradingAgent', type: 'TradingAgent' },
        bd_calls: bdCalls,
      };

      const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);
      const details = r.details as Record<string, unknown>;

      // Visibility: the keyword verdict is data-dependent (heuristic v1, drifts live).
      console.log(
        `[adverse-media live] result=${r.result} count=${details.total_match_count} matched=${JSON.stringify(details.matched_keywords)} bd_calls=${bdCalls.length}`,
      );

      // A real scored verdict was produced (not the best-effort skip/unavailable path).
      expect(['pass', 'review', 'fail']).toContain(r.result);
      expect(details.screening_unavailable).toBeUndefined();
      expect(typeof details.total_match_count).toBe('number');
      expect(Array.isArray(details.matched_keywords)).toBe(true);

      // Chain integrity (deterministic): one governed, fingerprinted SERP call.
      expect(bdCalls.length).toBeGreaterThanOrEqual(1);
      const serpCall = bdCalls[0];
      expect(serpCall.service).toBe('serp_api');
      expect(serpCall.governance_result).toBe('permit');
      expect(serpCall.response_sha256).toMatch(/^[a-f0-9]{64}$/);

      // Up to max_results_to_extract (3) governed, fingerprinted Crawl calls.
      const crawlCalls = bdCalls.filter((c) => c.service === 'crawl_api');
      expect(crawlCalls.length).toBeLessThanOrEqual(3);
      for (const c of crawlCalls) {
        expect(c.tool).toBe('scrape_url');
        expect(c.governance_result).toBe('permit');
        expect(c.response_sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }, 60000);
  },
);

// entity_adverse_media_check (v1) unit tests (Bubble 19) — hermetic.
//
// The in-process MCP calls (SERP + Crawl) are mocked, so these tests are deterministic
// and make no real BD calls. The live SERP→Crawl chain is exercised by the gated
// integration test (tests/integration/entity-adverse-media-live.test.ts).
//
// Policy under test (best-effort, non-blocking): adverse media is enrichment, not a
// gate on the screening infrastructure. Screening that cannot execute (no entity, SERP
// unreachable, all extractions fail) resolves to PASS; only content that is retrieved
// and scored can yield review/fail. Distinct-keyword counting drives the thresholds.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mcp/serp-tool', () => ({ runSerpAdverseMediaSearch: vi.fn() }));
vi.mock('@/lib/mcp/crawl-tool', () => ({ runCrawlArticleContent: vi.fn() }));

import { runSerpAdverseMediaSearch, type SerpToolResult } from '@/lib/mcp/serp-tool';
import { runCrawlArticleContent, type CrawlToolResult } from '@/lib/mcp/crawl-tool';
import { entityAdverseMediaCheckPredicate } from '@/lib/compliance/predicates/trading/entity-adverse-media-check';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';
import type { BDCallAudit, BDService } from '@/types/authzen';

const mockSerp = vi.mocked(runSerpAdverseMediaSearch);
const mockCrawl = vi.mocked(runCrawlArticleContent);

function bdCall(service: BDService): BDCallAudit {
  return {
    service,
    tool: service === 'serp_api' ? 'search_google' : 'scrape_url',
    parameters: {},
    matched_rule_id: service === 'serp_api' ? 'adverse_media_serp' : 'adverse_media_extract',
    governance_result: 'permit',
    composite_outcomes: [],
    executed_at: '2026-05-27T00:00:00.000Z',
    duration_ms: 1,
    response_sha256: 'f'.repeat(64),
    response_size_bytes: 10,
    bd_request_id: null,
  };
}

function serpOk(urls: string[]): SerpToolResult {
  return {
    ok: true,
    denied: false,
    reason: null,
    bd_call: bdCall('serp_api'),
    results: { organic: urls.map((link) => ({ link })) },
  };
}
function serpUnavailable(): SerpToolResult {
  return {
    ok: false,
    denied: false,
    reason: 'BD SERP call failed: BRIGHTDATA_API_TOKEN is not set',
    bd_call: bdCall('serp_api'),
    results: null,
  };
}
function crawlOk(markdown: string): CrawlToolResult {
  return { ok: true, denied: false, reason: null, bd_call: bdCall('crawl_api'), results: { items: [{ markdown }] } };
}
function crawlFail(): CrawlToolResult {
  return { ok: false, denied: false, reason: 'BD Crawl API call failed', bd_call: bdCall('crawl_api'), results: null };
}

function makeCtx(entity?: Record<string, unknown>): EvalContext & { bd_calls: BDCallAudit[] } {
  return {
    now: new Date('2026-05-27T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
    action_properties: entity ? { entity } : {},
    subject: { id: 'TradingAgent', type: 'TradingAgent' },
    bd_calls: [],
  };
}

const CLEAN = 'Quarterly earnings beat estimates; the board approved a routine dividend.';

beforeEach(() => {
  mockSerp.mockReset();
  mockCrawl.mockReset();
});

describe('entity_adverse_media_check (v1, Bubble 19)', () => {
  it('registered name is the canonical (unversioned) entity_adverse_media_check', () => {
    expect(entityAdverseMediaCheckPredicate.name).toBe('entity_adverse_media_check');
  });

  it('PASS — 3 clean URLs, 0 keyword matches', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com', 'https://b.com', 'https://c.com']));
    mockCrawl.mockResolvedValue(crawlOk(CLEAN));
    const ctx = makeCtx({ id: 'ENT-CLEAN-1' });

    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);

    expect(r.result).toBe('pass');
    expect(r.details.total_match_count).toBe(0);
    expect(r.details.matched_keywords).toEqual([]);
    expect(r.details.evaluated_urls).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(mockCrawl).toHaveBeenCalledTimes(3);
    // 1 SERP + 3 Crawl bd_calls collected onto the receipt.
    expect(ctx.bd_calls).toHaveLength(4);
    expect(ctx.bd_calls[0].service).toBe('serp_api');
    expect(ctx.bd_calls.slice(1).every((c) => c.service === 'crawl_api')).toBe(true);
  });

  it('REVIEW — 2 distinct keywords (default review=1, fail=3)', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('A federal fraud investigation was opened into the firm.'));
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-2' }));

    expect(r.result).toBe('review');
    expect(r.details.total_match_count).toBe(2);
    expect(r.details.matched_keywords).toEqual(expect.arrayContaining(['fraud', 'investigation']));
    expect(r.reason).toMatch(/analyst review required/);
  });

  it('FAIL — 4 distinct keywords (>= fail threshold 3)', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(
      crawlOk('The indictment alleges fraud and money laundering; regulators ordered an asset freeze.'),
    );
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-3' }));

    expect(r.result).toBe('fail');
    expect(r.details.total_match_count).toBe(4);
    expect(r.reason).toMatch(/meets fail threshold 3/);
  });

  it('BOUNDARY — exactly 1 match == review_threshold → review', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('An internal investigation is underway.'));
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-4' }));
    expect(r.result).toBe('review');
    expect(r.details.total_match_count).toBe(1);
  });

  it('BOUNDARY — exactly fail_threshold (3) matches → fail', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('fraud, investigation, indictment all reported.'));
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-5' }));
    expect(r.result).toBe('fail');
    expect(r.details.total_match_count).toBe(3);
  });

  it('PASS — SERP returns 0 results (nothing to score)', async () => {
    mockSerp.mockResolvedValue(serpOk([]));
    const ctx = makeCtx({ id: 'ENT-6' });
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);
    expect(r.result).toBe('pass');
    expect(r.details.total_match_count).toBe(0);
    expect(mockCrawl).not.toHaveBeenCalled();
    expect(ctx.bd_calls).toHaveLength(1); // SERP recorded, no crawls attempted
  });

  it('PASS (best-effort) — SERP unavailable (no creds) is non-blocking, recorded for audit', async () => {
    mockSerp.mockResolvedValue(serpUnavailable());
    const ctx = makeCtx({ id: 'ENT-7' });
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);

    expect(r.result).toBe('pass');
    expect(r.details.screening_unavailable).toBe(true);
    expect(mockCrawl).not.toHaveBeenCalled();
    expect(ctx.bd_calls).toHaveLength(1); // the SERP attempt is still recorded
    expect(ctx.bd_calls[0].service).toBe('serp_api');
  });

  it('partial failure — 1 of 3 Crawl calls fails, screening proceeds with the other 2', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com', 'https://b.com', 'https://c.com']));
    mockCrawl
      .mockResolvedValueOnce(crawlOk(CLEAN))
      .mockResolvedValueOnce(crawlFail())
      .mockResolvedValueOnce(crawlOk('A fraud investigation indictment was unsealed.'));
    const ctx = makeCtx({ id: 'ENT-8' });
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);

    expect(r.details.evaluated_urls).toEqual(['https://a.com', 'https://c.com']);
    expect(r.details.skipped_urls).toEqual(['https://b.com']);
    expect(r.result).toBe('fail'); // 3 distinct from the 2 readable URLs
    expect(ctx.bd_calls).toHaveLength(4); // 1 SERP + 3 Crawl attempts (incl. the failed one)
  });

  it('PASS (best-effort) — all Crawl calls fail (screening incomplete, non-blocking)', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com', 'https://b.com']));
    mockCrawl.mockResolvedValue(crawlFail());
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-9' }));
    expect(r.result).toBe('pass');
    expect(r.details.screening_incomplete).toBe(true);
    expect(r.details.skipped_urls).toEqual(['https://a.com', 'https://b.com']);
  });

  it('PASS — no entity to screen (skipped), no BD calls', async () => {
    const ctx = makeCtx(); // no entity in action_properties
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);
    expect(r.result).toBe('pass');
    expect(r.details.skipped).toBe(true);
    expect(mockSerp).not.toHaveBeenCalled();
    expect(ctx.bd_calls).toHaveLength(0);
  });

  it('falls back to entity.name when entity.id is absent', async () => {
    mockSerp.mockResolvedValue(serpOk([]));
    await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ name: 'Globex Meridian LLC' }));
    expect(mockSerp).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('Globex Meridian LLC') }),
    );
  });

  it('honors a custom keyword_list override (default keywords are ignored)', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    // Content has the DEFAULT keyword "fraud" but NOT the custom keyword → 0 matches → pass.
    mockCrawl.mockResolvedValue(crawlOk('Reports of fraud surfaced this quarter.'));
    const r = await entityAdverseMediaCheckPredicate.evaluate(
      { keyword_list: ['bankruptcy', 'default judgment'] },
      makeCtx({ id: 'ENT-10' }),
    );
    expect(r.result).toBe('pass');
    expect(r.details.total_match_count).toBe(0);
  });

  it('honors custom thresholds (review_threshold=2, fail_threshold=5)', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    // 3 distinct keywords: default would FAIL (>=3); with fail=5 this is REVIEW (>=2, <5).
    mockCrawl.mockResolvedValue(crawlOk('fraud, investigation, and indictment reported.'));
    const r = await entityAdverseMediaCheckPredicate.evaluate(
      { review_threshold: 2, fail_threshold: 5 },
      makeCtx({ id: 'ENT-11' }),
    );
    expect(r.result).toBe('review');
    expect(r.details.total_match_count).toBe(3);
    expect(r.details.review_threshold).toBe(2);
    expect(r.details.fail_threshold).toBe(5);
  });

  it('substitutes {entity_name} into a custom search_query_template', async () => {
    mockSerp.mockResolvedValue(serpOk([]));
    await entityAdverseMediaCheckPredicate.evaluate(
      { search_query_template: '"{entity_name}" enforcement OR penalty' },
      makeCtx({ id: 'ACME-CORP' }),
    );
    expect(mockSerp).toHaveBeenCalledWith(
      expect.objectContaining({ query: '"ACME-CORP" enforcement OR penalty' }),
    );
  });
});

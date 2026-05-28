// entity_adverse_media_check unit tests — hermetic.
//
// The in-process MCP calls (SERP + Crawl) and the LLM scorer are mocked, so these
// tests are deterministic and make no real BD or LLM calls. The live chains are
// exercised by gated integration tests:
//   tests/integration/entity-adverse-media-live.test.ts (BD SERP+Crawl)
//   tests/integration/adverse-media-llm-live.test.ts    (AI/ML API LLM)
//
// Policy under test (best-effort, non-blocking): adverse media is enrichment, not a
// gate on the screening infrastructure. Screening that cannot execute (no entity, SERP
// unreachable, all extractions fail) resolves to PASS; only content that is retrieved
// and scored can yield review/fail.
//
// Bubble 22 added LLM scoring with three modes: `llm_with_keyword_fallback` (default),
// `llm_only`, and `keyword_only`. With AIML_API_KEY unset, the default falls back to
// the Bubble 19 distinct-keyword scorer. The existing Bubble 19 behaviors are
// preserved under fallback; the new LLM-mode behaviors are covered below.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/mcp/serp-tool', () => ({ runSerpAdverseMediaSearch: vi.fn() }));
vi.mock('@/lib/mcp/crawl-tool', () => ({ runCrawlArticleContent: vi.fn() }));
vi.mock('@/lib/compliance/predicates/trading/adverse-media-llm-scorer', () => ({
  scoreAdverseMediaWithLlm: vi.fn(),
  CONTENT_CHAR_BUDGET: 6000,
}));

import { runSerpAdverseMediaSearch, type SerpToolResult } from '@/lib/mcp/serp-tool';
import { runCrawlArticleContent, type CrawlToolResult } from '@/lib/mcp/crawl-tool';
import { scoreAdverseMediaWithLlm } from '@/lib/compliance/predicates/trading/adverse-media-llm-scorer';
import { entityAdverseMediaCheckPredicate } from '@/lib/compliance/predicates/trading/entity-adverse-media-check';
import { LlmConfigError, LlmRequestError } from '@/lib/llm/client';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';
import type { BDCallAudit, BDService } from '@/types/authzen';

const mockSerp = vi.mocked(runSerpAdverseMediaSearch);
const mockCrawl = vi.mocked(runCrawlArticleContent);
const mockLlm = vi.mocked(scoreAdverseMediaWithLlm);

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
  mockLlm.mockReset();
  // Default the LLM scorer to throw LlmConfigError so the default mode
  // (`llm_with_keyword_fallback`) deterministically falls back to keyword scoring
  // in existing tests. Tests that exercise the LLM path override this.
  mockLlm.mockRejectedValue(new LlmConfigError('AIML_API_KEY is not set'));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('entity_adverse_media_check — keyword-fallback path (Bubble 19 behavior under default mode)', () => {
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
    expect(r.details.llm_fallback).toBe(true);
    expect(r.details.scoring_path).toBe('keyword');
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
    expect(mockLlm).not.toHaveBeenCalled();
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
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it('PASS — no entity to screen (skipped), no BD or LLM calls', async () => {
    const ctx = makeCtx(); // no entity in action_properties
    const r = await entityAdverseMediaCheckPredicate.evaluate({}, ctx);
    expect(r.result).toBe('pass');
    expect(r.details.skipped).toBe(true);
    expect(mockSerp).not.toHaveBeenCalled();
    expect(mockLlm).not.toHaveBeenCalled();
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

describe('entity_adverse_media_check — LLM scoring path (Bubble 22)', () => {
  it('LLM PASS — clean content; reason is the LLM reasoning, no llm_fallback', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('Quarterly earnings beat estimates.'));
    mockLlm.mockResolvedValue({
      verdict: 'pass',
      reasoning: 'No adverse media about ENT-LLM-1; content describes routine earnings.',
      concerns: [],
      model: 'gpt-4.1-mini-2025-04-14',
      cost: { credits_used: 200, usd_spent: 0.0001 },
      content_truncated: false,
      content_chars_sent: 100,
    });

    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-LLM-1' }));

    expect(r.result).toBe('pass');
    expect(r.reason).toBe('No adverse media about ENT-LLM-1; content describes routine earnings.');
    expect(r.details.scoring_path).toBe('llm');
    expect(r.details.scoring_mode).toBe('llm_with_keyword_fallback');
    expect(r.details.llm_verdict).toBe('pass');
    expect(r.details.llm_model).toBe('gpt-4.1-mini-2025-04-14');
    expect(r.details.llm_credits_used).toBe(200);
    expect(r.details.llm_usd_spent).toBeCloseTo(0.0001);
    expect(r.details.llm_fallback).toBeUndefined();
    expect(mockLlm).toHaveBeenCalledTimes(1);
  });

  it('LLM REVIEW — concerns array surfaces into details', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('Reports of an internal probe surfaced.'));
    mockLlm.mockResolvedValue({
      verdict: 'review',
      reasoning: 'Unverified internal probe; analyst should confirm.',
      concerns: ['unverified internal probe'],
      model: 'gpt-4.1-mini-2025-04-14',
      cost: { credits_used: 220, usd_spent: 0.00011 },
      content_truncated: false,
      content_chars_sent: 50,
    });

    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-LLM-2' }));

    expect(r.result).toBe('review');
    expect(r.details.llm_concerns).toEqual(['unverified internal probe']);
    expect(r.details.scoring_path).toBe('llm');
  });

  it('LLM FAIL — strong specific adverse media flows verbatim into reason', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('The SEC indicted Acme Corp for fraud.'));
    mockLlm.mockResolvedValue({
      verdict: 'fail',
      reasoning: 'SEC indicted Acme Corp for fraud and ordered an asset freeze.',
      concerns: ['SEC indictment', 'fraud', 'asset freeze'],
      model: 'gpt-4.1-mini-2025-04-14',
      cost: { credits_used: 280, usd_spent: 0.00014 },
      content_truncated: false,
      content_chars_sent: 80,
    });

    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'Acme Corp' }));

    expect(r.result).toBe('fail');
    expect(r.reason).toBe('SEC indicted Acme Corp for fraud and ordered an asset freeze.');
    expect(r.details.llm_concerns).toEqual(['SEC indictment', 'fraud', 'asset freeze']);
  });

  it('fallback path — LLM throws → keyword scorer runs → llm_fallback: true + llm_error recorded', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('A fraud investigation was opened.'));
    mockLlm.mockRejectedValue(new LlmRequestError('AI/ML API request failed: HTTP 500', 500, 'boom'));

    const r = await entityAdverseMediaCheckPredicate.evaluate({}, makeCtx({ id: 'ENT-LLM-FB' }));

    // Keyword scorer found 2 distinct keywords ("fraud", "investigation") → review.
    expect(r.result).toBe('review');
    expect(r.details.scoring_path).toBe('keyword');
    expect(r.details.llm_fallback).toBe(true);
    expect(r.details.llm_error).toMatch(/HTTP 500/);
    expect(r.details.total_match_count).toBe(2);
  });

  it('keyword_only mode — LLM scorer is NEVER called', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('A fraud investigation was opened.'));

    const r = await entityAdverseMediaCheckPredicate.evaluate(
      { scoring_mode: 'keyword_only' },
      makeCtx({ id: 'ENT-KW' }),
    );

    expect(r.result).toBe('review');
    expect(r.details.scoring_mode).toBe('keyword_only');
    expect(r.details.scoring_path).toBe('keyword');
    expect(r.details.llm_fallback).toBeUndefined();
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it('llm_only mode — LLM verdict is final, no keyword fallback', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    // Content has 4 keyword matches — keyword scorer would FAIL — but LLM says pass.
    mockCrawl.mockResolvedValue(
      crawlOk('fraud investigation indictment money laundering all unrelated to this entity'),
    );
    mockLlm.mockResolvedValue({
      verdict: 'pass',
      reasoning: 'Article discusses other entities; not adverse media about ENT-LLM-ONLY.',
      concerns: [],
      model: 'gpt-4.1-mini-2025-04-14',
      cost: { credits_used: 300, usd_spent: 0.00015 },
      content_truncated: false,
      content_chars_sent: 100,
    });

    const r = await entityAdverseMediaCheckPredicate.evaluate(
      { scoring_mode: 'llm_only' },
      makeCtx({ id: 'ENT-LLM-ONLY' }),
    );

    expect(r.result).toBe('pass');
    expect(r.details.scoring_mode).toBe('llm_only');
    expect(r.details.scoring_path).toBe('llm');
    // The keyword scorer was NOT consulted even though the content has 4 keyword hits.
    expect(r.details.total_match_count).toBeUndefined();
  });

  it('llm_only mode — LLM failure → pass with screening_unavailable + llm_error', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('Anything; LLM will throw.'));
    mockLlm.mockRejectedValue(new LlmRequestError('AI/ML API request timed out after 20000ms', 0, ''));

    const r = await entityAdverseMediaCheckPredicate.evaluate(
      { scoring_mode: 'llm_only' },
      makeCtx({ id: 'ENT-LLM-FAIL' }),
    );

    expect(r.result).toBe('pass');
    expect(r.details.screening_unavailable).toBe(true);
    expect(r.details.scoring_mode).toBe('llm_only');
    expect(r.details.llm_error).toMatch(/timed out/);
    // Keyword fields are absent because we did not run the keyword scorer.
    expect(r.details.total_match_count).toBeUndefined();
  });

  it('passes llm_model override into the LLM scorer call', async () => {
    mockSerp.mockResolvedValue(serpOk(['https://a.com']));
    mockCrawl.mockResolvedValue(crawlOk('content'));
    mockLlm.mockResolvedValue({
      verdict: 'pass',
      reasoning: 'no adverse media',
      concerns: [],
      model: 'gpt-4o-2024-08-06',
      cost: { credits_used: null, usd_spent: null },
      content_truncated: false,
      content_chars_sent: 7,
    });

    await entityAdverseMediaCheckPredicate.evaluate(
      { llm_model: 'openai/gpt-4o' },
      makeCtx({ id: 'ENT-MODEL' }),
    );

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_name: 'ENT-MODEL',
        model: 'openai/gpt-4o',
      }),
    );
  });
});

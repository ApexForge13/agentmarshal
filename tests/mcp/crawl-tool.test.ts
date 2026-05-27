import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCrawlArticleContent } from '@/lib/mcp/crawl-tool';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { ScopeContract, BDPermissionRule } from '@/types/authzen';
import type { BdCrawlResult } from '@/lib/bd/types';
import '@/lib/compliance/predicates/bd';

const RULE: BDPermissionRule = {
  rule_id: 'adverse_media_extract',
  match: {
    service: 'crawl_api',
    tool: 'scrape_url',
    parameters: { purpose: { equals: 'adverse_media_extract' } },
  },
  composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches'],
  decision: 'permit',
};

function contractWith(rules: BDPermissionRule[]): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'crawl-tool-test',
    agent_id: 'agentmarshal:contract/crawl-tool-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-27T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const RAW = JSON.stringify([{ url: 'https://example.com/a', markdown: '# Acme Corp probe', text: 'Acme Corp probe' }]);
function okCrawl(): BdCrawlResult {
  return { results: { items: JSON.parse(RAW) }, raw: RAW, bd_request_id: 'req-crawl', status: 200 };
}

const ARGS = {
  agent_id: 'agent-x',
  url: 'https://example.com/a',
  purpose: 'adverse_media_extract',
};

describe('runCrawlArticleContent (Bubble 18)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — governs, executes, fingerprints the extracted items into a permit bd_call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const crawl = vi.fn(async () => okCrawl());
    const out = await runCrawlArticleContent(ARGS, { crawl: crawl as never });

    expect(out.ok).toBe(true);
    expect(out.denied).toBe(false);
    expect(out.results?.items).toHaveLength(1);
    expect(crawl).toHaveBeenCalledTimes(1);
    expect(crawl).toHaveBeenCalledWith({ url: ARGS.url });

    const c = out.bd_call;
    expect(c.service).toBe('crawl_api');
    expect(c.tool).toBe('scrape_url');
    expect(c.governance_result).toBe('permit');
    expect(c.matched_rule_id).toBe('adverse_media_extract');
    expect(c.composite_outcomes).toEqual([
      { composite: 'bd_service_authorized', result: 'pass' },
      { composite: 'bd_query_purpose_matches', result: 'pass' },
    ]);
    expect(c.response_sha256).toBe(sha256Hex(Buffer.from(RAW, 'utf-8')));
    expect(c.response_size_bytes).toBe(Buffer.byteLength(RAW, 'utf-8'));
    expect(c.bd_request_id).toBe('req-crawl');
    expect(typeof c.executed_at).toBe('string');
  });

  it('DENY — purpose mismatch fails the rule match; BD call never made', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const crawl = vi.fn(async () => okCrawl());
    const out = await runCrawlArticleContent(
      { ...ARGS, purpose: 'price_scraping' },
      { crawl: crawl as never },
    );

    expect(out.denied).toBe(true);
    expect(crawl).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
  });

  it('permitted but BD execution fails — records attempt, ok:false, no fingerprint', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const crawl = vi.fn(async () => {
      throw new Error('dataset timeout');
    });
    const out = await runCrawlArticleContent(ARGS, { crawl: crawl as never });

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(false);
    expect(out.reason).toMatch(/BD Crawl API call failed/);
    expect(out.bd_call.governance_result).toBe('permit');
    expect(out.bd_call.response_sha256).toBeNull();
    expect(typeof out.bd_call.executed_at).toBe('string');
  });
});

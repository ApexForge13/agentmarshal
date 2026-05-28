import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runBrowseRegistryPage } from '@/lib/mcp/browser-tool';
import { setContractOverride, clearContractOverrides } from '@/lib/authzen/contracts';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { ScopeContract, BDPermissionRule } from '@/types/authzen';
import type { BdScrapingBrowserResult } from '@/lib/bd/scraping-browser-client';
import '@/lib/compliance/predicates/bd';

const RULE: BDPermissionRule = {
  rule_id: 'ubo_registry_lookup',
  match: {
    service: 'scraping_browser',
    tool: 'browse_url',
    parameters: {
      purpose: { equals: 'registry_lookup' },
      url: { domain_in: ['find-and-update.company-information.service.gov.uk', '*.opencorporates.com'] },
    },
  },
  composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches', 'bd_domain_in_scope'],
  decision: 'permit',
};

function contractWith(rules: BDPermissionRule[]): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'browser-tool-test',
    agent_id: 'agentmarshal:contract/browser-tool-test',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-27T00:00:00Z',
    declared_scope: [
      { rule_id: 'base', match: { subject: { id: { exists: true } } }, decision: { effect: 'allow' } },
    ],
    bd_permissions: rules,
  };
}

const URL = 'https://find-and-update.company-information.service.gov.uk/company/12345678';
const HTML = '<html><body>ACME TRADING LTD — officers</body></html>';
function okBrowse(): BdScrapingBrowserResult {
  return { results: { content: HTML, url: URL, status: 200 }, raw: HTML, bd_request_id: null, status: 200 };
}

const ARGS = { agent_id: 'agent-x', url: URL, purpose: 'registry_lookup' };

describe('runBrowseRegistryPage (Bubble 20)', () => {
  beforeEach(() => clearContractOverrides());
  afterEach(() => clearContractOverrides());

  it('PERMIT — governs (3 composites pass), browses, fingerprints into a permit bd_call', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const browse = vi.fn(async () => okBrowse());
    const out = await runBrowseRegistryPage(ARGS, { browse: browse as never });

    expect(out.ok).toBe(true);
    expect(out.denied).toBe(false);
    expect(out.results?.content).toBe(HTML);
    expect(browse).toHaveBeenCalledWith({ url: URL, wait_for_selector: undefined });

    const c = out.bd_call;
    expect(c.service).toBe('scraping_browser');
    expect(c.tool).toBe('browse_url');
    expect(c.governance_result).toBe('permit');
    expect(c.matched_rule_id).toBe('ubo_registry_lookup');
    expect(c.composite_outcomes).toEqual([
      { composite: 'bd_service_authorized', result: 'pass' },
      { composite: 'bd_query_purpose_matches', result: 'pass' },
      { composite: 'bd_domain_in_scope', result: 'pass' },
    ]);
    expect(c.response_sha256).toBe(sha256Hex(Buffer.from(HTML, 'utf-8')));
  });

  it('DENY — url outside the domain allowlist does not match the rule; no browse', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const browse = vi.fn(async () => okBrowse());
    const out = await runBrowseRegistryPage(
      { ...ARGS, url: 'https://evil.example.com/company/1' },
      { browse: browse as never },
    );
    expect(out.denied).toBe(true);
    expect(browse).not.toHaveBeenCalled();
    expect(out.bd_call.governance_result).toBe('deny');
    expect(out.bd_call.matched_rule_id).toBeNull();
  });

  it('DENY — no bd_permissions rule; no browse', async () => {
    setContractOverride('agent-x', contractWith([]));
    const browse = vi.fn(async () => okBrowse());
    const out = await runBrowseRegistryPage(ARGS, { browse: browse as never });
    expect(out.denied).toBe(true);
    expect(browse).not.toHaveBeenCalled();
  });

  it('permitted but the browser call fails — records attempt, ok:false, no fingerprint', async () => {
    setContractOverride('agent-x', contractWith([RULE]));
    const browse = vi.fn(async () => {
      throw new Error('Navigation timeout exceeded');
    });
    const out = await runBrowseRegistryPage(ARGS, { browse: browse as never });

    expect(out.ok).toBe(false);
    expect(out.denied).toBe(false);
    expect(out.reason).toMatch(/BD Scraping Browser call failed/);
    expect(out.bd_call.governance_result).toBe('permit');
    expect(out.bd_call.response_sha256).toBeNull();
  });
});

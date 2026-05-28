// browse_registry_page tool logic (Bubble 20 Phase C), decoupled from the MCP SDK
// transport so it is unit-testable. governMCPCall gates the call; on permit we drive
// BD's Scraping Browser (CDP) to render the page and fingerprint the HTML into a
// BDCallAudit entry. bdScrapingBrowserBrowse is injectable for tests. Mirrors crawl-tool.

import { governMCPCall } from './govern';
import { bdScrapingBrowserBrowse } from '@/lib/bd/scraping-browser-client';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { BDCallAudit } from '@/types/authzen';

const SERVICE = 'scraping_browser' as const;
const TOOL = 'browse_url';

export interface BrowseRegistryPageArgs {
  agent_id: string;
  url: string;
  /** Declared purpose, matched against the bd_permissions rule (e.g. 'registry_lookup'). */
  purpose: string;
  /** Optional selector to wait for (JS-rendered registry pages). */
  wait_for_selector?: string;
  /** subject.type for the agent-contract-map type-name fallback. */
  subject_type?: string;
}

export interface BrowserToolDeps {
  browse?: typeof bdScrapingBrowserBrowse;
}

export interface BrowserToolResult {
  ok: boolean;
  denied: boolean;
  reason: string | null;
  bd_call: BDCallAudit;
  /** Rendered page content on success; null when denied or execution failed. */
  results: { content: string; url: string; status: number } | null;
}

export async function runBrowseRegistryPage(
  args: BrowseRegistryPageArgs,
  deps: BrowserToolDeps = {},
): Promise<BrowserToolResult> {
  const browse = deps.browse ?? bdScrapingBrowserBrowse;
  const parameters: Record<string, unknown> = { url: args.url, purpose: args.purpose };

  const gov = await governMCPCall({
    agent_id: args.agent_id,
    service: SERVICE,
    tool: TOOL,
    parameters,
    subject_type: args.subject_type,
  });
  const composite_outcomes = gov.composite_outcomes.map((o) => ({
    composite: o.predicate,
    result: o.result,
  }));

  if (!gov.permit) {
    return {
      ok: false,
      denied: true,
      reason: gov.reason,
      results: null,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'deny',
        composite_outcomes,
        executed_at: null,
        duration_ms: null,
        response_sha256: null,
        response_size_bytes: null,
        bd_request_id: null,
      },
    };
  }

  const executedAt = new Date();
  const t0 = Date.now();
  try {
    const out = await browse({ url: args.url, wait_for_selector: args.wait_for_selector });
    return {
      ok: true,
      denied: false,
      reason: null,
      results: out.results,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'permit',
        composite_outcomes,
        executed_at: executedAt.toISOString(),
        duration_ms: Date.now() - t0,
        response_sha256: sha256Hex(Buffer.from(out.raw, 'utf-8')),
        response_size_bytes: Buffer.byteLength(out.raw, 'utf-8'),
        bd_request_id: out.bd_request_id,
      },
    };
  } catch (err) {
    // Governance permitted but the browser call failed. Record the attempt for audit.
    return {
      ok: false,
      denied: false,
      reason: `BD Scraping Browser call failed: ${(err as Error).message}`,
      results: null,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'permit',
        composite_outcomes,
        executed_at: executedAt.toISOString(),
        duration_ms: Date.now() - t0,
        response_sha256: null,
        response_size_bytes: null,
        bd_request_id: null,
      },
    };
  }
}

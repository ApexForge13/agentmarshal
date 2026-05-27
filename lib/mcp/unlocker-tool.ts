// unlock_news_article tool logic (Bubble 18), decoupled from the MCP SDK transport so
// it is unit-testable. governMCPCall gates the call; on permit we run the BD Web
// Unlocker fetch and fingerprint the response into a BDCallAudit entry an upstream
// signed record can carry. bdWebUnlockerFetch is injectable for tests. Mirrors serp-tool.

import { governMCPCall } from './govern';
import { bdWebUnlockerFetch } from '@/lib/bd/client';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { BDCallAudit } from '@/types/authzen';

const SERVICE = 'web_unlocker' as const;
const TOOL = 'unlock_url';

export interface UnlockNewsArticleArgs {
  agent_id: string;
  url: string;
  /** Declared purpose, matched against the bd_permissions rule (e.g. 'adverse_media_unlock'). */
  purpose: string;
  /** subject.type for the agent-contract-map type-name fallback. */
  subject_type?: string;
}

export interface UnlockerToolDeps {
  unlock?: typeof bdWebUnlockerFetch;
}

export interface UnlockerToolResult {
  /** true = governance permitted AND the BD call succeeded. */
  ok: boolean;
  /** true = blocked by the Scope Contract's bd_permissions (no BD call made). */
  denied: boolean;
  /** denial reason, or BD-execution error message, or null on success. */
  reason: string | null;
  /** Always present — the audit entry for the (attempted or blocked) BD call. */
  bd_call: BDCallAudit;
  /** Unlocked page content on success; null when denied or execution failed. */
  results: { content: string } | null;
}

export async function runUnlockNewsArticle(
  args: UnlockNewsArticleArgs,
  deps: UnlockerToolDeps = {},
): Promise<UnlockerToolResult> {
  const unlock = deps.unlock ?? bdWebUnlockerFetch;
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
    const out = await unlock({ url: args.url });
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
    // Governance permitted but the BD call failed. Record the attempt (no response
    // captured) so the audit trail still shows the permitted-but-failed call.
    return {
      ok: false,
      denied: false,
      reason: `BD Web Unlocker call failed: ${(err as Error).message}`,
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

// Captures the signed demo-receipt fixtures shown in the /receipts persisted-receipt
// browser (Bubble 21). Hits the live AI/ML API (real LLM verdict + reasoning) and live
// FreeTSA, and signs with the real FileKeyProvider, so it is gated behind
// CAPTURE_DEMO_RECEIPTS=1 and skipped in CI (keeps `npx vitest run` hermetic).
//
//   set -a; . ./.env; set +a; CAPTURE_DEMO_RECEIPTS=1 npx vitest run tests/demo/capture-demo-receipts.test.ts
//
// Runs under vitest (not tsx) because the emit-and-sign chain transitively imports the
// ESM-only `canonicalize` package — same constraint as lib/verify/build-examples.ts.
//
// PROVENANCE (the plan's sanctioned fallback): the counterparties below are FICTIONAL
// and have no live web coverage for SERP/Crawl to surface, so the article content is
// supplied DIRECTLY to the LLM scorer. The verdict + reasoning are a REAL AI/ML API
// call; the SERP + Crawl bd_calls model the real governed-pipeline shape; and the
// injection is documented in the signed composite details (capture_provenance). Because
// the note rides the signed body, it is itself tamper-evident — the record never
// misrepresents how it was produced. Content samples mirror
// tests/integration/adverse-media-llm-live.test.ts.

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

import {
  scoreAdverseMediaWithLlm,
  type AdverseMediaLlmScoreResult,
} from '@/lib/compliance/predicates/trading/adverse-media-llm-scorer';
import { buildInternalAuditRecord } from '@/lib/compliance/internal-audit/builder';
import { FileKeyProvider } from '@/lib/compliance/keys/file-provider';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
} from '@/lib/compliance/timestamp/tsa-client';
import { FREETSA_URL, FREETSA_TSA_NAME } from '@/lib/compliance/timestamp/freetsa-ca';
import { verifyReceipt } from '@/lib/verify/verify-receipt';
import type { EvaluationResult, BDCallAudit } from '@/types/authzen';
import type { CompositePredicateEvaluation } from '@/lib/authzen/composite-dispatch';
import type { TimestampToken, Timestamper } from '@/lib/compliance/timestamp/types';

const CAPTURE = process.env.CAPTURE_DEMO_RECEIPTS === '1';
const HAS_AIML = !!process.env.AIML_API_KEY;
const OUT_DIR = path.resolve(process.cwd(), 'data/demo-receipts');

// ExecutionAgent is outside the InternalAudit AgentType enum, so the access route maps
// it to UNKNOWN_AGENT_TYPE_FALLBACK ('COO') and preserves the original in action.inputs.
// We reproduce that exactly so the fixtures match what the live PDP emits.
const FALLBACK_AGENT_TYPE = 'COO' as const;
const ORIGINAL_SUBJECT_TYPE = 'ExecutionAgent';
const QUERY_TEMPLATE =
  '"{entity}" (fraud OR investigation OR lawsuit OR sanctions OR indictment OR misconduct)';

// --- live FreeTSA timestamper (bypasses the VITEST no-op in createFreeTsaTimestamper) -
// Direct RFC 3161 round-trip, same primitives as tests/timestamp/capture-fixtures.ts.
// Returns null on any failure so a FreeTSA outage degrades to signed-but-not-timestamped
// (still verified:true) rather than aborting the capture.
const liveFreeTsa: Timestamper = {
  async timestamp(hashHex: string): Promise<TimestampToken | null> {
    try {
      const reqDer = buildTimeStampRequest(hashHex);
      const resp = await fetch(FREETSA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/timestamp-query' },
        body: new Uint8Array(reqDer),
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return null;
      const respDer = Buffer.from(await resp.arrayBuffer());
      const parsed = parseTimeStampResponse(respDer);
      return {
        tsa: FREETSA_TSA_NAME,
        token_b64: parsed.tokenDer.toString('base64'),
        issued_at: parsed.genTime.toISOString(),
      };
    } catch {
      return null;
    }
  },
};

function basePredicate() {
  return {
    rule_id: 'trading-v1-base',
    predicate_path: 'subject.id',
    constraint: { exists: true },
    actual_value: 'execution-agent-001',
    result: 'pass' as const,
    reason: 'subject.id is present',
  };
}

function notSanctionedPass(entity: string): CompositePredicateEvaluation {
  return {
    predicate: 'entity_not_sanctioned',
    result: 'pass',
    reason: `counterparty ${entity} not present on the injected OFAC SDN list`,
    details: { entity_id: entity, matched_entry: null },
  };
}

function adverseMediaEval(args: {
  entity: string;
  searchQuery: string;
  sourceUrl: string;
  score: AdverseMediaLlmScoreResult;
}): CompositePredicateEvaluation {
  const { entity, searchQuery, sourceUrl, score } = args;
  const details: Record<string, unknown> = {
    entity_identifier: entity,
    search_query: searchQuery,
    evaluated_urls: [sourceUrl],
    skipped_urls: [],
    scoring_mode: 'llm_with_keyword_fallback',
    scoring_path: 'llm',
    llm_verdict: score.verdict,
    llm_reasoning: score.reasoning,
    llm_concerns: score.concerns,
    llm_model: score.model,
    llm_content_truncated: score.content_truncated,
    llm_content_chars_sent: score.content_chars_sent,
    capture_provenance:
      `DEMO FIXTURE: ${entity} is a fictional counterparty with no live web coverage to crawl; ` +
      'the adverse-media article content was supplied directly to the AI/ML API LLM scorer ' +
      '(the verdict and reasoning here are a real live model call). The SERP + Crawl bd_calls ' +
      'model the real governed-pipeline shape. This note rides the signed body and is itself ' +
      'tamper-evident. Source content: tests/integration/adverse-media-llm-live.test.ts.',
  };
  if (score.cost.credits_used !== null) details.llm_credits_used = score.cost.credits_used;
  if (score.cost.usd_spent !== null) details.llm_usd_spent = score.cost.usd_spent;
  return { predicate: 'entity_adverse_media_check', result: score.verdict, reason: score.reasoning, details };
}

function bdScreeningChain(args: {
  searchQuery: string;
  sourceUrl: string;
  articleContent: string;
  issuedAt: Date;
}): BDCallAudit[] {
  const { searchQuery, sourceUrl, articleContent, issuedAt } = args;
  const ts = issuedAt.toISOString();
  const okOutcomes = [
    { composite: 'bd_service_authorized', result: 'pass' as const },
    { composite: 'bd_query_purpose_matches', result: 'pass' as const },
  ];
  return [
    {
      service: 'serp_api',
      tool: 'search_google',
      parameters: { query: searchQuery, purpose: 'adverse_media_screening', num_results: 3 },
      matched_rule_id: 'adverse_media_serp',
      governance_result: 'permit',
      composite_outcomes: okOutcomes,
      executed_at: ts,
      duration_ms: 712,
      response_sha256: sha256Hex(Buffer.from(`serp:${searchQuery}`, 'utf-8')),
      response_size_bytes: 8123,
      bd_request_id: 'brd-demo-serp-0001',
    },
    {
      service: 'crawl_api',
      tool: 'scrape_url',
      parameters: { url: sourceUrl, purpose: 'adverse_media_extract' },
      matched_rule_id: 'adverse_media_extract',
      governance_result: 'permit',
      composite_outcomes: okOutcomes,
      executed_at: ts,
      duration_ms: 1340,
      response_sha256: sha256Hex(Buffer.from(articleContent, 'utf-8')),
      response_size_bytes: Buffer.byteLength(articleContent, 'utf-8'),
      bd_request_id: 'brd-demo-crawl-0001',
    },
  ];
}

function evaluationResultFor(
  verdict: 'pass' | 'review' | 'fail',
  composites: CompositePredicateEvaluation[],
  reviewReason: string,
): EvaluationResult {
  // Faithful to lib/authzen/evaluate.ts: a composite fail makes the rule non-allowable,
  // so it falls through to the no_match implicit deny; a review (no fail) denies with
  // review_required; a pass lets the allow rule fire.
  if (verdict === 'fail') {
    return {
      effect: 'deny',
      evaluation_path: 'no_match',
      matched_rule_id: null,
      out_of_scope_term: null,
      reason_code: 'NO_MATCH_IMPLICIT_DENY',
      reason: 'No declared_scope rule matched; implicit deny per Scope Contract semantics.',
      predicate_evaluations: [basePredicate()],
      composite_evaluations: composites,
    };
  }
  if (verdict === 'review') {
    return {
      effect: 'deny',
      evaluation_path: 'no_match',
      matched_rule_id: null,
      out_of_scope_term: null,
      reason_code: 'NO_MATCH_IMPLICIT_DENY',
      reason: 'No declared_scope rule matched; implicit deny per Scope Contract semantics.',
      review_required: true,
      review_reason: reviewReason,
      predicate_evaluations: [basePredicate()],
      composite_evaluations: composites,
    };
  }
  return {
    effect: 'allow',
    evaluation_path: 'declared_scope',
    matched_rule_id: 'trading-v1-base',
    out_of_scope_term: null,
    reason_code: 'TRADING_V1_ALLOWED',
    reason: 'Trading desk v1 composite checks passed; entity not on the injected OFAC SDN list.',
    predicate_evaluations: [basePredicate()],
    composite_evaluations: composites,
  };
}

async function buildAndWrite(args: {
  slug: string;
  entity: string;
  actionType: string;
  evaluationResult: EvaluationResult;
  bdCalls: BDCallAudit[];
  evaluationId: string;
  requestId: string;
  recordId: string;
  /** Hash of the previous record in the chain (null = genesis). */
  previousAuditHash: string | null;
}): Promise<{ audit_hash: string }> {
  const handle = await new FileKeyProvider().getActiveSigningHandle();
  const issuedAt = new Date();
  const record = await buildInternalAuditRecord({
    evaluationResult: args.evaluationResult,
    tenantId: 'default',
    evaluationId: args.evaluationId,
    requestId: args.requestId,
    recordId: args.recordId,
    agent: { id: 'execution-agent-001', type: FALLBACK_AGENT_TYPE, version: 'v0.2' },
    action: {
      type: args.actionType,
      inputs: { entity: { id: args.entity }, _unrecognized_subject_type: ORIGINAL_SUBJECT_TYPE },
      outputs: {},
    },
    contract: { id: 'trading_v2', version: '2' },
    previousAuditHash: args.previousAuditHash,
    issuedAt,
    signers: [{ handle, role: 'agentmarshal' }],
    bdCalls: args.bdCalls,
    timestamper: liveFreeTsa,
  });

  // Verify against the published key exactly as /api/verify/receipt does.
  const verdict = await verifyReceipt(record as unknown as Record<string, unknown>);
  console.log(
    `[capture] ${args.slug}: verified=${verdict.verified} reason="${verdict.reason}" timestamp=${verdict.timestamp.status} prev=${args.previousAuditHash ? args.previousAuditHash.slice(0, 12) : 'genesis'}`,
  );
  expect(verdict.verified, `${args.slug} must verify true`).toBe(true);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.resolve(OUT_DIR, `${args.slug}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { audit_hash: record.audit_hash };
}

// Fictional samples (mirrors tests/integration/adverse-media-llm-live.test.ts).
const HELIX = {
  entity: 'Helix Bridge Capital Partners',
  url: 'https://www.reuters.com/legal/helix-bridge-capital-partners-indictment',
  content: `
Federal prosecutors today unsealed a 17-count indictment against Helix Bridge
Capital Partners and three of its principals, alleging a multi-year scheme to
misrepresent fund performance to limited partners and to launder proceeds through
shell entities in Cyprus. The SEC simultaneously froze the firm's US accounts and
imposed an emergency operating ban. Helix Bridge Capital Partners executives are
scheduled to appear in the Southern District of New York on Friday.
`.trim(),
};
const NORTHWIND = {
  entity: 'Northwind Artisanal Stationery Collective',
  url: 'https://www.northwind-collective.example/press/quarterly-results',
  content: `
Northwind Artisanal Stationery Collective today announced a routine quarterly
financial result, with revenue up 4% on the prior quarter. The Collective's
co-founder Mira Ostrov said the company would invest in a new letterpress facility
in Trieste and expand its hand-bound ledger line. The board declared a regular
dividend; no regulatory filings or legal matters were disclosed.
`.trim(),
};
const MERIDIAN = {
  entity: 'Meridian Corp',
  url: 'https://www.theguardian.com/business/meridian-group-holdings-hmrc-inquiry',
  content: `
Meridian Group Holdings, a wholly unrelated UK property developer, is under
investigation for council-tax avoidance. Sources at HMRC said no other companies
sharing the Meridian name are implicated. Meridian Corp, the US industrial
fastener maker, has filed routine quarterly earnings and is not subject to any
regulatory action.
`.trim(),
};

async function captureLlmRecord(args: {
  sample: { entity: string; url: string; content: string };
  slug: string;
  actionType: string;
  evaluationId: string;
  requestId: string;
  recordId: string;
  previousAuditHash: string | null;
}): Promise<{ audit_hash: string }> {
  const { sample } = args;
  const searchQuery = QUERY_TEMPLATE.replace('{entity}', sample.entity);
  const score = await scoreAdverseMediaWithLlm({ entity_name: sample.entity, content: sample.content });
  console.log(`[capture] ${args.slug} LLM verdict=${score.verdict} reasoning="${score.reasoning}"`);
  const composites = [
    notSanctionedPass(sample.entity),
    adverseMediaEval({ entity: sample.entity, searchQuery, sourceUrl: sample.url, score }),
  ];
  return buildAndWrite({
    slug: args.slug,
    entity: sample.entity,
    actionType: args.actionType,
    evaluationResult: evaluationResultFor(score.verdict, composites, score.reasoning),
    bdCalls: bdScreeningChain({ searchQuery, sourceUrl: sample.url, articleContent: sample.content, issuedAt: new Date() }),
    evaluationId: args.evaluationId,
    requestId: args.requestId,
    recordId: args.recordId,
    previousAuditHash: args.previousAuditHash,
  });
}

// One sequential run produces a REAL hash chain: each record's previous_audit_hash is
// the prior record's audit_hash (a signed field, so the link cannot be forged after the
// fact). Newest-first in the browser: governance-deny → Meridian → Helix → Northwind.
describe.skipIf(!CAPTURE || !HAS_AIML)('capture demo receipts (manual, network — AI/ML API + FreeTSA)', () => {
  it('captures the signed adverse-media demo chain + governance-deny tail', async () => {
    // 1) Northwind — genesis, clean allow.
    const northwind = await captureLlmRecord({
      sample: NORTHWIND,
      slug: 'northwind-clean',
      actionType: 'fetch_research',
      evaluationId: 'b1111111-1111-4111-8111-111111111111',
      requestId: 'b2222222-2222-4222-8222-222222222222',
      recordId: 'ia-b3333333-3333-4333-8333-333333333333',
      previousAuditHash: null,
    });

    // 2) Helix Bridge — the HERO: live adverse-media fail → no_match implicit deny.
    const helix = await captureLlmRecord({
      sample: HELIX,
      slug: 'helix-bridge-fail',
      actionType: 'execute_trade',
      evaluationId: 'a1111111-1111-4111-8111-111111111111',
      requestId: 'a2222222-2222-4222-8222-222222222222',
      recordId: 'ia-a3333333-3333-4333-8333-333333333333',
      previousAuditHash: northwind.audit_hash,
    });

    // 3) Meridian Corp — name-collision coverage is NOT scored as fail (LLM disambiguates).
    const meridian = await captureLlmRecord({
      sample: MERIDIAN,
      slug: 'meridian-collision',
      actionType: 'propose_trade',
      evaluationId: 'c1111111-1111-4111-8111-111111111111',
      requestId: 'c2222222-2222-4222-8222-222222222222',
      recordId: 'ia-c3333333-3333-4333-8333-333333333333',
      previousAuditHash: helix.audit_hash,
    });

    // 4) Governance-deny (no LLM): AgentMarshal refuses to forward an un-allowlisted
    // Bright Data MCP passthrough tool. The trade action is permitted; the denied
    // bd_call is the policy-refused moment the /receipts panel renders distinctly.
    const deniedCall: BDCallAudit = {
      service: 'mcp_server',
      tool: 'bd_mcp_passthrough',
      parameters: {
        purpose: 'mcp_passthrough',
        bd_tool_name: 'web_data_amazon_product',
        target: 'Helix Bridge Capital Partners',
      },
      matched_rule_id: null,
      governance_result: 'deny',
      composite_outcomes: [
        { composite: 'bd_service_authorized', result: 'pass' },
        { composite: 'bd_passthrough_tool_in_allowlist', result: 'fail' },
      ],
      executed_at: null,
      duration_ms: null,
      response_sha256: null,
      response_size_bytes: null,
      bd_request_id: null,
    };
    await buildAndWrite({
      slug: 'governance-deny-passthrough',
      entity: 'Helix Bridge Capital Partners',
      actionType: 'ask_brightdata_assistant',
      evaluationResult: {
        effect: 'allow',
        evaluation_path: 'declared_scope',
        matched_rule_id: 'trading-v1-base',
        out_of_scope_term: null,
        reason_code: 'TRADING_V1_ALLOWED',
        reason: 'Trading desk v1 composite checks passed; entity not on the injected OFAC SDN list.',
        predicate_evaluations: [basePredicate()],
        composite_evaluations: [notSanctionedPass('Helix Bridge Capital Partners')],
      },
      bdCalls: [deniedCall],
      evaluationId: 'd1111111-1111-4111-8111-111111111111',
      requestId: 'd2222222-2222-4222-8222-222222222222',
      recordId: 'ia-d3333333-3333-4333-8333-333333333333',
      previousAuditHash: meridian.audit_hash,
    });
  }, 180000);
});

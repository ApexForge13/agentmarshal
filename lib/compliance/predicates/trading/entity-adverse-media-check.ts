// entity_adverse_media_check composite predicate.
//
// Real adverse-media screening: during a trading evaluation it chains two GOVERNED
// Bright Data calls through the MCP proxy — a SERP search for the counterparty, then
// a Crawl API extraction of each top result — and scores the extracted article
// content to return pass / review / fail. Each governed call pushes its bd_call
// audit entry onto ctx.bd_calls so the full screening chain (1 SERP + up to N
// Crawl calls) rides the signed record.
//
// Scoring is configurable (Bubble 22). The default `llm_with_keyword_fallback` calls
// the AI/ML API LLM to interpret the content; on any LLM failure (no key, request
// error, malformed output) it falls back to the Bubble 19 distinct-keyword scorer
// and records `llm_fallback: true`. `keyword_only` forces the heuristic path
// (byte-identical to Bubble 19). `llm_only` requires the LLM; on failure the
// composite returns pass with `screening_unavailable: true` (matches the
// can't-screen best-effort semantics).
//
// Best-effort (non-blocking) policy: adverse media is enrichment, not a gate on the
// screening infrastructure. When screening cannot execute — no BD credentials, the
// SERP call is denied/errors, SERP returns nothing, or every extraction fails — the
// composite returns PASS (recorded for audit), NOT a block. Only content that is
// actually retrieved and scored can yield review/fail. This keeps hermetic / un-
// provisioned environments operable while real interpretation happens wherever BD
// credentials are present. (v0, ./entity-adverse-media-check-v0.ts, was pass-always.)
//
// Thresholds are per-contract via the composite's static input (review_threshold /
// fail_threshold over the count of DISTINCT keywords found); defaults below. They
// apply only to the keyword scorer; the LLM verdict is three-state directly.
//
// Inputs:
//   - action_properties.entity.id (or .entity.name) : the counterparty to screen
//   - ctx.subject {id, type}                          : resolves the agent's contract
//   - static input                                    : query template, thresholds,
//                                                       keywords, scoring_mode, llm_model

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import { runSerpAdverseMediaSearch } from '@/lib/mcp/serp-tool';
import { runCrawlArticleContent } from '@/lib/mcp/crawl-tool';
import { DEFAULT_FINANCIAL_CRIME_KEYWORDS } from '../adverse-media-keywords';
import {
  scoreAdverseMediaWithLlm,
  type AdverseMediaLlmScoreResult,
} from './adverse-media-llm-scorer';
import { AIML_DEFAULT_MODEL } from '@/lib/llm/client';

export type AdverseMediaScoringMode =
  | 'llm_with_keyword_fallback'
  | 'llm_only'
  | 'keyword_only';

interface EntityAdverseMediaCheckInput {
  /** Search query; `{entity_name}` is substituted with the resolved entity identifier. */
  search_query_template?: string;
  /** How many top organic results to extract + score (1..5). */
  max_results_to_extract?: number;
  /** Financial-crime keywords to count (case-insensitive, distinct). */
  keyword_list?: string[];
  /** Distinct-keyword count at/above which the result is `review` (keyword scorer only). */
  review_threshold?: number;
  /** Distinct-keyword count at/above which the result is `fail` (keyword scorer only). */
  fail_threshold?: number;
  /** How to score retrieved content. Default: `llm_with_keyword_fallback`. */
  scoring_mode?: AdverseMediaScoringMode;
  /** AI/ML API model id when scoring with the LLM. Default: openai/gpt-4.1-mini. */
  llm_model?: string;
}

// Quote-anchored on the entity so SERP surfaces coverage ABOUT the counterparty, not
// generic crime news: an unquoted keyword pile ("{name} fraud investigation indictment")
// was verified live to pull other entities' fraud articles and false-positive a clean
// counterparty to `fail`. The keyword scorer remains heuristic; Bubble 22 swaps the
// default scoring step for an LLM that reads the article and decides whether the
// entity is actually the subject of the adverse coverage.
const DEFAULT_QUERY_TEMPLATE =
  '"{entity_name}" (fraud OR investigation OR lawsuit OR sanctions OR indictment OR misconduct)';
const DEFAULT_MAX_RESULTS = 3;
const DEFAULT_REVIEW_THRESHOLD = 1;
const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_SCORING_MODE: AdverseMediaScoringMode = 'llm_with_keyword_fallback';
const CRAWL_PURPOSE = 'adverse_media_extract';

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    search_query_template: { type: 'string', minLength: 1, default: DEFAULT_QUERY_TEMPLATE },
    max_results_to_extract: { type: 'integer', minimum: 1, maximum: 5, default: DEFAULT_MAX_RESULTS },
    keyword_list: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    review_threshold: { type: 'integer', minimum: 1, default: DEFAULT_REVIEW_THRESHOLD },
    fail_threshold: { type: 'integer', minimum: 1, default: DEFAULT_FAIL_THRESHOLD },
    scoring_mode: {
      type: 'string',
      enum: ['llm_with_keyword_fallback', 'llm_only', 'keyword_only'],
      default: DEFAULT_SCORING_MODE,
    },
    llm_model: { type: 'string', minLength: 1, default: AIML_DEFAULT_MODEL },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'entity_adverse_media_check';

/** Reads the entity identifier to screen: action_properties.entity.id, then .name. */
function readEntityIdentifier(props: Record<string, unknown> | undefined): string | null {
  const entity = props?.['entity'];
  if (typeof entity !== 'object' || entity === null) return null;
  const e = entity as Record<string, unknown>;
  const id = e['id'];
  if (typeof id === 'string' && id.length > 0) return id;
  const name = e['name'];
  if (typeof name === 'string' && name.length > 0) return name;
  return null;
}

/** Distinct keywords (case-insensitive) present in `content`. */
function findMatchedKeywords(content: string, keywords: string[]): string[] {
  const haystack = content.toLowerCase();
  return keywords.filter((kw) => kw.length > 0 && haystack.includes(kw.toLowerCase()));
}

interface KeywordScoreContext {
  entityId: string;
  searchQuery: string;
  evaluatedUrls: string[];
  skippedUrls: string[];
  aggregatedContent: string;
  keywords: string[];
  reviewThreshold: number;
  failThreshold: number;
  scoringMode: AdverseMediaScoringMode;
  llmFallback: boolean;
  llmError?: string;
}

/** Scores the aggregated content with the Bubble 19 distinct-keyword heuristic. */
function scoreWithKeywords(c: KeywordScoreContext): CompositePredicateEvaluation {
  const matchedKeywords = findMatchedKeywords(c.aggregatedContent, c.keywords);
  const matchCount = matchedKeywords.length;
  const details: Record<string, unknown> = {
    entity_identifier: c.entityId,
    search_query: c.searchQuery,
    evaluated_urls: c.evaluatedUrls,
    skipped_urls: c.skippedUrls,
    matched_keywords: matchedKeywords,
    total_match_count: matchCount,
    review_threshold: c.reviewThreshold,
    fail_threshold: c.failThreshold,
    scoring_mode: c.scoringMode,
    scoring_path: 'keyword',
  };
  if (c.llmFallback) {
    details.llm_fallback = true;
    if (c.llmError) details.llm_error = c.llmError;
  }
  const n = c.evaluatedUrls.length;

  if (matchCount >= c.failThreshold) {
    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `strong adverse media signals: ${matchCount} keyword matches (${matchedKeywords.join(', ')}) across ${n} source URLs — meets fail threshold ${c.failThreshold}`,
      details,
    };
  }
  if (matchCount >= c.reviewThreshold) {
    return {
      predicate: PREDICATE_NAME,
      result: 'review',
      reason: `possible adverse media: ${matchCount} keyword matches (${matchedKeywords.join(', ')}) across ${n} source URLs — analyst review required`,
      details,
    };
  }
  return {
    predicate: PREDICATE_NAME,
    result: 'pass',
    reason: `no adverse media signals across ${n} source URLs (${matchCount} keyword matches, below review threshold ${c.reviewThreshold})`,
    details,
  };
}

/** Builds the composite evaluation from a successful LLM score. */
function evaluationFromLlmScore(args: {
  entityId: string;
  searchQuery: string;
  evaluatedUrls: string[];
  skippedUrls: string[];
  scoringMode: AdverseMediaScoringMode;
  score: AdverseMediaLlmScoreResult;
}): CompositePredicateEvaluation {
  const { score } = args;
  const details: Record<string, unknown> = {
    entity_identifier: args.entityId,
    search_query: args.searchQuery,
    evaluated_urls: args.evaluatedUrls,
    skipped_urls: args.skippedUrls,
    scoring_mode: args.scoringMode,
    scoring_path: 'llm',
    llm_verdict: score.verdict,
    llm_reasoning: score.reasoning,
    llm_concerns: score.concerns,
    llm_model: score.model,
    llm_content_truncated: score.content_truncated,
    llm_content_chars_sent: score.content_chars_sent,
  };
  if (score.cost.credits_used !== null) details.llm_credits_used = score.cost.credits_used;
  if (score.cost.usd_spent !== null) details.llm_usd_spent = score.cost.usd_spent;
  return {
    predicate: PREDICATE_NAME,
    result: score.verdict,
    reason: score.reasoning,
    details,
  };
}

export const entityAdverseMediaCheckPredicate: CompositePredicate<EntityAdverseMediaCheckInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, ctx): Promise<CompositePredicateEvaluation> {
    const entityId = readEntityIdentifier(ctx.action_properties);

    // Nothing to screen (no counterparty entity, or no resolvable subject) → pass.
    if (entityId === null || !ctx.subject) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: 'no counterparty entity to screen; adverse-media check skipped',
        details: { skipped: true },
      };
    }

    const template = input.search_query_template ?? DEFAULT_QUERY_TEMPLATE;
    const maxResults = input.max_results_to_extract ?? DEFAULT_MAX_RESULTS;
    const keywords = input.keyword_list ?? [...DEFAULT_FINANCIAL_CRIME_KEYWORDS];
    const reviewThreshold = input.review_threshold ?? DEFAULT_REVIEW_THRESHOLD;
    const failThreshold = input.fail_threshold ?? DEFAULT_FAIL_THRESHOLD;
    const scoringMode = input.scoring_mode ?? DEFAULT_SCORING_MODE;
    const llmModel = input.llm_model ?? AIML_DEFAULT_MODEL;
    const searchQuery = template.replace(/\{entity_name\}/g, entityId);

    // 1) SERP search through the governed MCP proxy.
    const serp = await runSerpAdverseMediaSearch({
      agent_id: ctx.subject.id,
      subject_type: ctx.subject.type,
      query: searchQuery,
      num_results: maxResults,
    });
    ctx.bd_calls?.push(serp.bd_call);

    // Best-effort: the screening provider is unreachable (denied / no creds / error).
    // Non-blocking → pass, but recorded for audit via the pushed bd_call.
    if (!serp.ok) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `adverse-media screening unavailable for ${entityId} (${serp.reason ?? 'SERP call did not succeed'}); recorded for audit, not blocking`,
        details: {
          entity_identifier: entityId,
          search_query: searchQuery,
          screening_unavailable: true,
          scoring_mode: scoringMode,
          serp_governance_result: serp.bd_call.governance_result,
        },
      };
    }

    const urls = (serp.results?.organic ?? [])
      .map((r) => r.link)
      .filter((link): link is string => typeof link === 'string' && link.length > 0)
      .slice(0, maxResults);

    if (urls.length === 0) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `no adverse media signals for ${entityId}: SERP returned no results to screen`,
        details: {
          entity_identifier: entityId,
          search_query: searchQuery,
          evaluated_urls: [],
          skipped_urls: [],
          matched_keywords: [],
          total_match_count: 0,
          review_threshold: reviewThreshold,
          fail_threshold: failThreshold,
          scoring_mode: scoringMode,
        },
      };
    }

    // 2) Crawl API extraction of each top result through the governed MCP proxy.
    const evaluatedUrls: string[] = [];
    const skippedUrls: string[] = [];
    let aggregatedContent = '';

    for (const url of urls) {
      const crawl = await runCrawlArticleContent({
        agent_id: ctx.subject.id,
        subject_type: ctx.subject.type,
        url,
        purpose: CRAWL_PURPOSE,
      });
      ctx.bd_calls?.push(crawl.bd_call);

      if (!crawl.ok || !crawl.results) {
        // Partial failure is recoverable: skip this URL, keep screening the rest.
        skippedUrls.push(url);
        continue;
      }
      for (const item of crawl.results.items) {
        const markdown = (item as { markdown?: unknown }).markdown;
        if (typeof markdown === 'string') aggregatedContent += `\n${markdown}`;
      }
      evaluatedUrls.push(url);
    }

    // Best-effort: every extraction failed → we could not screen. Non-blocking → pass.
    if (evaluatedUrls.length === 0) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `adverse-media screening incomplete for ${entityId}: all ${skippedUrls.length} source extraction(s) failed; recorded for audit, not blocking`,
        details: {
          entity_identifier: entityId,
          search_query: searchQuery,
          evaluated_urls: [],
          skipped_urls: skippedUrls,
          screening_incomplete: true,
          scoring_mode: scoringMode,
        },
      };
    }

    // 3) Score the aggregated content. Branch on scoring_mode.
    const keywordCtx: KeywordScoreContext = {
      entityId,
      searchQuery,
      evaluatedUrls,
      skippedUrls,
      aggregatedContent,
      keywords,
      reviewThreshold,
      failThreshold,
      scoringMode,
      llmFallback: false,
    };

    if (scoringMode === 'keyword_only') {
      return scoreWithKeywords(keywordCtx);
    }

    // Both llm_only and llm_with_keyword_fallback attempt the LLM first.
    try {
      const score = await scoreAdverseMediaWithLlm({
        entity_name: entityId,
        content: aggregatedContent,
        model: llmModel,
      });
      return evaluationFromLlmScore({
        entityId,
        searchQuery,
        evaluatedUrls,
        skippedUrls,
        scoringMode,
        score,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (scoringMode === 'llm_only') {
        // The LLM was the configured scorer; without it we cannot screen. Best-effort: pass.
        return {
          predicate: PREDICATE_NAME,
          result: 'pass',
          reason: `adverse-media screening unavailable for ${entityId}: LLM scorer failed (${message}); recorded for audit, not blocking`,
          details: {
            entity_identifier: entityId,
            search_query: searchQuery,
            evaluated_urls: evaluatedUrls,
            skipped_urls: skippedUrls,
            screening_unavailable: true,
            scoring_mode: scoringMode,
            llm_error: message,
            llm_model: llmModel,
          },
        };
      }
      // llm_with_keyword_fallback → run the keyword scorer and flag the fallback.
      return scoreWithKeywords({ ...keywordCtx, llmFallback: true, llmError: message });
    }
  },
};

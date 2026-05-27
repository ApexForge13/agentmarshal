// entity_adverse_media_check composite predicate (v1 — Bubble 19).
//
// Real adverse-media screening: during a trading evaluation it chains two GOVERNED
// Bright Data calls through the MCP proxy — a SERP search for the counterparty, then
// a Crawl API extraction of each top result — and scores the extracted article
// content against a financial-crime keyword list, returning pass / review / fail.
// Each governed call pushes its bd_call audit entry onto ctx.bd_calls so the full
// screening chain (1 SERP + up to N Crawl calls) rides the signed record.
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
// fail_threshold over the count of DISTINCT keywords found); defaults below.
//
// Inputs:
//   - action_properties.entity.id (or .entity.name) : the counterparty to screen
//   - ctx.subject {id, type}                          : resolves the agent's contract
//   - static input                                    : query template, thresholds, keywords

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import { runSerpAdverseMediaSearch } from '@/lib/mcp/serp-tool';
import { runCrawlArticleContent } from '@/lib/mcp/crawl-tool';
import { DEFAULT_FINANCIAL_CRIME_KEYWORDS } from '../adverse-media-keywords';

interface EntityAdverseMediaCheckInput {
  /** Search query; `{entity_name}` is substituted with the resolved entity identifier. */
  search_query_template?: string;
  /** How many top organic results to extract + score (1..5). */
  max_results_to_extract?: number;
  /** Financial-crime keywords to count (case-insensitive, distinct). */
  keyword_list?: string[];
  /** Distinct-keyword count at/above which the result is `review`. */
  review_threshold?: number;
  /** Distinct-keyword count at/above which the result is `fail`. */
  fail_threshold?: number;
}

// Quote-anchored on the entity so SERP surfaces coverage ABOUT the counterparty, not
// generic crime news: an unquoted keyword pile ("{name} fraud investigation indictment")
// was verified live to pull other entities' fraud articles and false-positive a clean
// counterparty to `fail`. Keyword interpretation stays heuristic (v1) — the v0.3
// roadmap replaces it with LLM scoring.
const DEFAULT_QUERY_TEMPLATE =
  '"{entity_name}" (fraud OR investigation OR lawsuit OR sanctions OR indictment OR misconduct)';
const DEFAULT_MAX_RESULTS = 3;
const DEFAULT_REVIEW_THRESHOLD = 1;
const DEFAULT_FAIL_THRESHOLD = 3;
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
        },
      };
    }

    // 3) Score the aggregated content against the keyword list.
    const matchedKeywords = findMatchedKeywords(aggregatedContent, keywords);
    const matchCount = matchedKeywords.length;
    const details = {
      entity_identifier: entityId,
      search_query: searchQuery,
      evaluated_urls: evaluatedUrls,
      skipped_urls: skippedUrls,
      matched_keywords: matchedKeywords,
      total_match_count: matchCount,
      review_threshold: reviewThreshold,
      fail_threshold: failThreshold,
    };
    const n = evaluatedUrls.length;

    if (matchCount >= failThreshold) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `strong adverse media signals: ${matchCount} keyword matches (${matchedKeywords.join(', ')}) across ${n} source URLs — meets fail threshold ${failThreshold}`,
        details,
      };
    }
    if (matchCount >= reviewThreshold) {
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
      reason: `no adverse media signals across ${n} source URLs (${matchCount} keyword matches, below review threshold ${reviewThreshold})`,
      details,
    };
  },
};

// Bright Data SERP API response types (Bubble 17).
//
// We call the BD Direct API (POST https://api.brightdata.com/request) against a
// Google search URL carrying brd_json=1, so BD returns a PARSED JSON SERP payload
// rather than raw HTML. BD's payload has many fields; we type only the ones we
// surface or fingerprint and keep an index signature for the rest. Field names
// confirmed against a live call in Phase 3d.

/** A single organic (non-ad) search result. */
export interface BDSerpOrganicResult {
  rank?: number;
  link?: string;
  title?: string;
  description?: string;
  display_link?: string;
  [k: string]: unknown;
}

/** Top-level brd_json=1 Google SERP payload (best-effort typed). */
export interface BDSerpResponse {
  general?: {
    search_engine?: string;
    query?: string;
    results_cnt?: number;
    [k: string]: unknown;
  };
  organic?: BDSerpOrganicResult[];
  knowledge?: Record<string, unknown>;
  people_also_ask?: unknown[];
  related?: unknown[];
  [k: string]: unknown;
}

/**
 * Result of bdSerpSearch. `results` is the parsed SERP payload; `raw` is the exact
 * response body BD returned (the fingerprint substrate — the caller sha256s it for
 * the receipt's bd_call.response_sha256). `bd_request_id` is BD's own trace id for
 * cross-referencing against BD's logs.
 */
export interface BdSerpSearchResult {
  results: BDSerpResponse;
  raw: string;
  bd_request_id: string | null;
  status: number;
}

// === Bubble 18: Web Unlocker / Crawl API result types ===
// Same field set as BdSerpSearchResult: `raw` is the exact response body (the
// fingerprint substrate the tool layer sha256s into bd_call.response_sha256),
// `results` is the per-service view surfaced to the agent, `bd_request_id` is BD's
// trace id. sha256/size/duration are computed by the tool layer, not the client.

/**
 * Result of a raw-format BD Direct API fetch (Web Unlocker). The upstream is fetched
 * with format:"raw", so `results.content` is the response body (typically HTML) — the
 * same bytes as `raw`, surfaced as the agent-facing payload.
 */
export interface BdContentFetchResult {
  results: { content: string };
  raw: string;
  bd_request_id: string | null;
  status: number;
}

/**
 * Result of bdCrawlScrape. The Crawl API (datasets/v3/scrape) returns an array — one
 * entry per input URL. We always send a single URL, so `results.items` is that array
 * (flattened to a 1-element array when BD returns a bare object).
 */
export interface BdCrawlResult {
  results: { items: unknown[] };
  raw: string;
  bd_request_id: string | null;
  status: number;
}

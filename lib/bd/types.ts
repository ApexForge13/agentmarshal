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

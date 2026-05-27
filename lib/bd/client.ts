// Bright Data Direct API clients (Bubble 17: SERP; Bubble 18: Web Unlocker, Crawl API).
//
// SERP and Web Unlocker share the zone-based Direct API:
//   POST https://api.brightdata.com/request  { zone, url, format: "raw", ... }
// The Crawl API uses the dataset scrape endpoint instead:
//   POST https://api.brightdata.com/datasets/v3/scrape?dataset_id=<id>&...  { input: [{ url }] }
// All three authenticate identically: Authorization: Bearer <BRIGHTDATA_API_TOKEN>.
//
// Scraping Browser is intentionally NOT here: that product is driven over CDP/WebSocket
// (Puppeteer/Playwright/Selenium), not this Bearer /request API — hitting /request with a
// browser zone returns a 403 "a browser should be used to access this zone". Deferred to a
// later bubble (it needs a CDP client + the zone username/password credential model).
//
// bdDirectApiRequest centralises the shared transport — bearer auth, the POST, and the
// error-envelope handling Bubble 17 discovered: BD returns HTTP 200 even when the upstream
// fetch was blocked, surfacing the real upstream status/reason on x-brd-* response headers.
// Per-service response parsing (SERP/Crawl JSON, Unlocker HTML) stays in each caller.
//
// `fetchImpl` is injectable so unit tests mock the HTTP layer without stubbing global
// fetch; production callers use the default global fetch.

import type {
  BDSerpResponse,
  BdSerpSearchResult,
  BdContentFetchResult,
  BdCrawlResult,
} from './types';

const BD_REQUEST_ENDPOINT = 'https://api.brightdata.com/request';
const BD_CRAWL_ENDPOINT = 'https://api.brightdata.com/datasets/v3/scrape';

export interface BdSerpSearchParams {
  /** Search query string. */
  query: string;
  /** 2-letter country code for geo-targeting (Google `gl=`). Default: 'us'. */
  country?: string;
  /** Number of results requested (Google `num=`). */
  num_results?: number;
}

export interface BdWebUnlockerParams {
  /** Absolute URL to fetch through the Web Unlocker zone. */
  url: string;
  /** 2-letter country code for geo-targeting the exit node. */
  country?: string;
}

export interface BdCrawlParams {
  /** Absolute URL to extract clean content from. */
  url: string;
}

/** Thrown when BD credentials are not configured. */
export class BdConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BdConfigError';
  }
}

/** Thrown when the BD request fails (non-2xx) or the response is not parseable. */
export class BdRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'BdRequestError';
  }
}

/** Builds the Google search URL BD will fetch, with brd_json=1 for parsed output. */
export function buildGoogleSerpUrl(params: BdSerpSearchParams): string {
  const u = new URL('https://www.google.com/search');
  u.searchParams.set('q', params.query);
  u.searchParams.set('gl', params.country ?? 'us');
  if (params.num_results !== undefined) {
    u.searchParams.set('num', String(params.num_results));
  }
  // Ask BD to parse the SERP and return JSON rather than raw HTML.
  u.searchParams.set('brd_json', '1');
  return u.toString();
}

/** Reads the first present response header from a list of candidate names. */
function pickHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const v = headers.get(name);
    if (v) return v;
  }
  return null;
}

/**
 * Shared BD Direct API transport. Reads + injects the bearer token, POSTs `body` to
 * `endpoint`, and applies the common failure checks: non-2xx, the x-brd-* upstream
 * error envelope (HTTP 200 + x-brd-status-code >= 400 or x-brd-err-msg), and an empty
 * body. Returns the raw response body, HTTP status, and BD request id. Throws
 * BdConfigError (missing token) before any fetch, BdRequestError on failure.
 * `label` names the service in error messages.
 */
async function bdDirectApiRequest(
  endpoint: string,
  body: unknown,
  label: string,
  fetchImpl: typeof fetch,
): Promise<{ raw: string; status: number; bd_request_id: string | null }> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new BdConfigError('BRIGHTDATA_API_TOKEN is not set');

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new BdRequestError(
      `BrightData ${label} request failed: HTTP ${res.status}`,
      res.status,
      raw.slice(0, 2000),
    );
  }

  // BD's Direct API returns HTTP 200 even when the upstream fetch was blocked or
  // failed; the real upstream status + reason ride x-brd-* response headers. E.g.
  // a non-SERP zone hitting google.com yields x-brd-status-code: 403 + x-brd-err-msg.
  // Surface that rather than a misleading parse failure on the (empty) body.
  const brdStatus = res.headers.get('x-brd-status-code');
  const brdErrMsg = res.headers.get('x-brd-err-msg') ?? res.headers.get('x-brd-error');
  if ((brdStatus !== null && Number(brdStatus) >= 400) || brdErrMsg !== null) {
    throw new BdRequestError(
      `BrightData ${label} upstream error${brdStatus ? ` (status ${brdStatus})` : ''}: ${brdErrMsg ?? 'unknown'}`,
      brdStatus !== null ? Number(brdStatus) : res.status,
      raw.slice(0, 2000),
    );
  }

  if (raw.length === 0) {
    throw new BdRequestError(`BrightData ${label} returned an empty response body`, res.status, '');
  }

  return {
    raw,
    status: res.status,
    bd_request_id: pickHeader(res.headers, ['x-brd-request-id', 'x-response-id', 'x-brd-trace']),
  };
}

/**
 * Runs one SERP search through the BD Direct API. Throws BdConfigError when
 * credentials are missing, BdRequestError on non-2xx or non-JSON responses.
 */
export async function bdSerpSearch(
  params: BdSerpSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<BdSerpSearchResult> {
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  if (!zone) throw new BdConfigError('BRIGHTDATA_SERP_ZONE is not set');

  const url = buildGoogleSerpUrl(params);
  const { raw, status, bd_request_id } = await bdDirectApiRequest(
    BD_REQUEST_ENDPOINT,
    { zone, url, format: 'raw' },
    'SERP',
    fetchImpl,
  );

  let results: BDSerpResponse;
  try {
    results = JSON.parse(raw) as BDSerpResponse;
  } catch {
    throw new BdRequestError(
      'BrightData SERP response was not valid JSON (expected a brd_json=1 payload)',
      status,
      raw.slice(0, 2000),
    );
  }

  return { results, raw, bd_request_id, status };
}

/**
 * Fetches a URL through the Web Unlocker zone (format:"raw" → HTML), bypassing
 * anti-bot/paywall measures. Throws BdConfigError when the unlocker zone or token is
 * missing, BdRequestError on request/upstream failure.
 */
export async function bdWebUnlockerFetch(
  params: BdWebUnlockerParams,
  fetchImpl: typeof fetch = fetch,
): Promise<BdContentFetchResult> {
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
  if (!zone) throw new BdConfigError('BRIGHTDATA_UNLOCKER_ZONE is not set');

  const body: Record<string, unknown> = { zone, url: params.url, format: 'raw' };
  if (params.country) body.country = params.country;

  const { raw, status, bd_request_id } = await bdDirectApiRequest(
    BD_REQUEST_ENDPOINT,
    body,
    'Web Unlocker',
    fetchImpl,
  );

  return { results: { content: raw }, raw, bd_request_id, status };
}

/**
 * Extracts clean content from a URL via the Crawl API's dataset scrape endpoint
 * (synchronous: notify=false). BD returns an array (one entry per input URL); we send
 * one URL, so results.items is that array. Throws BdConfigError when the dataset id or
 * token is missing, BdRequestError on request/upstream failure or non-JSON response.
 */
export async function bdCrawlScrape(
  params: BdCrawlParams,
  fetchImpl: typeof fetch = fetch,
): Promise<BdCrawlResult> {
  const datasetId = process.env.BRIGHTDATA_CRAWL_DATASET_ID;
  if (!datasetId) throw new BdConfigError('BRIGHTDATA_CRAWL_DATASET_ID is not set');

  const endpoint = `${BD_CRAWL_ENDPOINT}?dataset_id=${encodeURIComponent(datasetId)}&notify=false&include_errors=true`;
  const { raw, status, bd_request_id } = await bdDirectApiRequest(
    endpoint,
    { input: [{ url: params.url }] },
    'Crawl API',
    fetchImpl,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BdRequestError('BrightData Crawl API response was not valid JSON', status, raw.slice(0, 2000));
  }
  // The scrape endpoint returns one entry per input URL; we always send exactly one.
  const items = Array.isArray(parsed) ? parsed : [parsed];

  return { results: { items }, raw, bd_request_id, status };
}

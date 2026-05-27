// Bright Data SERP API client (Bubble 17 — SERP only).
//
// Calls the BD Direct API: POST https://api.brightdata.com/request with
// { zone, url, format: "raw" } and an Authorization: Bearer <token> header. We
// target a Google search URL carrying brd_json=1 so BD returns a parsed JSON SERP
// payload. Credentials come from BRIGHTDATA_API_TOKEN + BRIGHTDATA_SERP_ZONE.
//
// `fetchImpl` is injectable so unit tests can mock the HTTP layer without
// stubbing global fetch; production callers use the default global fetch.
//
// Web Unlocker / Scraping Browser / the remaining BD services land in Bubble 18.

import type { BDSerpResponse, BdSerpSearchResult } from './types';

const BD_REQUEST_ENDPOINT = 'https://api.brightdata.com/request';

export interface BdSerpSearchParams {
  /** Search query string. */
  query: string;
  /** 2-letter country code for geo-targeting (Google `gl=`). Default: 'us'. */
  country?: string;
  /** Number of results requested (Google `num=`). */
  num_results?: number;
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
 * Runs one SERP search through the BD Direct API. Throws BdConfigError when
 * credentials are missing, BdRequestError on non-2xx or non-JSON responses.
 */
export async function bdSerpSearch(
  params: BdSerpSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<BdSerpSearchResult> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  if (!token) throw new BdConfigError('BRIGHTDATA_API_TOKEN is not set');
  if (!zone) throw new BdConfigError('BRIGHTDATA_SERP_ZONE is not set');

  const url = buildGoogleSerpUrl(params);
  const res = await fetchImpl(BD_REQUEST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ zone, url, format: 'raw' }),
  });

  const raw = await res.text();

  if (!res.ok) {
    throw new BdRequestError(
      `BrightData SERP request failed: HTTP ${res.status}`,
      res.status,
      raw.slice(0, 2000),
    );
  }

  // BD's Direct API returns HTTP 200 even when the upstream fetch was blocked or
  // failed; the real upstream status + reason ride x-brd-* response headers. E.g.
  // a non-SERP zone hitting google.com yields x-brd-status-code: 403 + x-brd-err-msg
  // "...please get access via a SERP API zone...". Surface that rather than a
  // misleading JSON-parse failure on the (empty) body.
  const brdStatus = res.headers.get('x-brd-status-code');
  const brdErrMsg = res.headers.get('x-brd-err-msg') ?? res.headers.get('x-brd-error');
  if ((brdStatus !== null && Number(brdStatus) >= 400) || brdErrMsg !== null) {
    throw new BdRequestError(
      `BrightData SERP upstream error${brdStatus ? ` (status ${brdStatus})` : ''}: ${brdErrMsg ?? 'unknown'}`,
      brdStatus !== null ? Number(brdStatus) : res.status,
      raw.slice(0, 2000),
    );
  }

  if (raw.length === 0) {
    throw new BdRequestError('BrightData SERP returned an empty response body', res.status, '');
  }

  let results: BDSerpResponse;
  try {
    results = JSON.parse(raw) as BDSerpResponse;
  } catch {
    throw new BdRequestError(
      'BrightData SERP response was not valid JSON (expected a brd_json=1 payload)',
      res.status,
      raw.slice(0, 2000),
    );
  }

  return {
    results,
    raw,
    bd_request_id: pickHeader(res.headers, ['x-brd-request-id', 'x-response-id', 'x-brd-trace']),
    status: res.status,
  };
}

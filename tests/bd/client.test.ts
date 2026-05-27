// Bright Data SERP client unit tests (Bubble 17) — mocked fetch, no real calls.
// The live round-trip lives in tests/integration/mcp-bd-roundtrip.test.ts (gated
// on BRIGHTDATA_API_TOKEN).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bdSerpSearch,
  buildGoogleSerpUrl,
  BdConfigError,
  BdRequestError,
} from '@/lib/bd/client';

function mockFetch(body: string, init: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

const SAMPLE_SERP = JSON.stringify({
  general: { search_engine: 'google', query: 'acme corp fraud' },
  organic: [
    { rank: 1, link: 'https://example.com/a', title: 'Acme news', description: 'desc' },
  ],
});

describe('bdSerpSearch (Bubble 17)', () => {
  beforeEach(() => {
    vi.stubEnv('BRIGHTDATA_API_TOKEN', 'test-token-xyz');
    vi.stubEnv('BRIGHTDATA_SERP_ZONE', 'test_serp_zone');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path: parses brd_json results, exposes raw body + request id', async () => {
    const fetchImpl = mockFetch(SAMPLE_SERP, {
      status: 200,
      headers: { 'x-brd-request-id': 'req-abc-123' },
    });
    const out = await bdSerpSearch({ query: 'acme corp fraud', num_results: 1 }, fetchImpl);

    expect(out.status).toBe(200);
    expect(out.raw).toBe(SAMPLE_SERP);
    expect(out.bd_request_id).toBe('req-abc-123');
    expect(out.results.organic?.[0]?.title).toBe('Acme news');

    // The Direct API was called correctly: endpoint, bearer token, brd_json url, raw format.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toBe('https://api.brightdata.com/request');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token-xyz');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.zone).toBe('test_serp_zone');
    expect(sentBody.format).toBe('raw');
    expect(sentBody.url).toContain('brd_json=1');
    expect(sentBody.url).toContain('q=acme+corp+fraud');
  });

  it('error path: non-2xx throws BdRequestError carrying status + body', async () => {
    const fetchImpl = mockFetch('auth failed', { status: 401 });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toMatchObject({
      name: 'BdRequestError',
      status: 401,
    });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toBeInstanceOf(BdRequestError);
  });

  it('malformed path: 2xx with non-JSON body throws BdRequestError', async () => {
    const fetchImpl = mockFetch('<html>captcha</html>', { status: 200 });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toBeInstanceOf(BdRequestError);
  });

  it('BD envelope error: HTTP 200 but x-brd-status-code 403 surfaces the upstream reason', async () => {
    // Exactly what a non-SERP (datacenter) zone returns for google.com: 200 with
    // an empty body and the real 403 + reason in x-brd-* headers.
    const fetchImpl = mockFetch('', {
      status: 200,
      headers: {
        'x-brd-status-code': '403',
        'x-brd-err-msg': 'Forbidden: requests to this domain are blocked, get access via a SERP API zone',
      },
    });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toMatchObject({
      name: 'BdRequestError',
      status: 403,
    });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toThrow(/SERP API zone/);
  });

  it('config error: missing token throws BdConfigError before any fetch', async () => {
    vi.stubEnv('BRIGHTDATA_API_TOKEN', '');
    const fetchImpl = mockFetch(SAMPLE_SERP, { status: 200 });
    await expect(bdSerpSearch({ query: 'x' }, fetchImpl)).rejects.toBeInstanceOf(BdConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('buildGoogleSerpUrl', () => {
  it('encodes query, defaults gl=us, sets brd_json=1', () => {
    const url = new URL(buildGoogleSerpUrl({ query: 'foo bar' }));
    expect(url.origin + url.pathname).toBe('https://www.google.com/search');
    expect(url.searchParams.get('q')).toBe('foo bar');
    expect(url.searchParams.get('gl')).toBe('us');
    expect(url.searchParams.get('brd_json')).toBe('1');
    expect(url.searchParams.get('num')).toBeNull();
  });

  it('honors country + num_results', () => {
    const url = new URL(buildGoogleSerpUrl({ query: 'q', country: 'gb', num_results: 5 }));
    expect(url.searchParams.get('gl')).toBe('gb');
    expect(url.searchParams.get('num')).toBe('5');
  });
});

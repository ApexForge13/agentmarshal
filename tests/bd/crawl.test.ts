// Bright Data Crawl API client unit tests (Bubble 18) — mocked fetch, no real calls.
// Crawl uses the dataset scrape endpoint (not /request) and returns a JSON array, one
// entry per input URL. The live round-trip lives in tests/integration/mcp-bd-roundtrip.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bdCrawlScrape, BdConfigError, BdRequestError } from '@/lib/bd/client';

function mockFetch(body: string, init: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

const CRAWL_ARRAY = JSON.stringify([
  { url: 'https://example.com', markdown: '# Example Domain', text: 'Example Domain' },
]);

describe('bdCrawlScrape (Bubble 18)', () => {
  beforeEach(() => {
    vi.stubEnv('BRIGHTDATA_API_TOKEN', 'test-token-xyz');
    vi.stubEnv('BRIGHTDATA_CRAWL_DATASET_ID', 'gd_test_dataset');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path: flattens BD array into results.items, posts input:[{url}] to the scrape endpoint', async () => {
    const fetchImpl = mockFetch(CRAWL_ARRAY, { status: 200, headers: { 'x-brd-request-id': 'req-crawl-1' } });
    const out = await bdCrawlScrape({ url: 'https://example.com' }, fetchImpl);

    expect(out.status).toBe(200);
    expect(out.raw).toBe(CRAWL_ARRAY);
    expect(out.results.items).toHaveLength(1);
    expect((out.results.items[0] as { markdown: string }).markdown).toBe('# Example Domain');
    expect(out.bd_request_id).toBe('req-crawl-1');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain('https://api.brightdata.com/datasets/v3/scrape');
    expect(calledUrl).toContain('dataset_id=gd_test_dataset');
    expect(calledUrl).toContain('notify=false');
    expect(calledUrl).toContain('include_errors=true');
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer test-token-xyz');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.input).toEqual([{ url: 'https://example.com' }]);
  });

  it('wraps a bare object response into a single-element items array', async () => {
    const fetchImpl = mockFetch(JSON.stringify({ markdown: '# Solo' }), { status: 200 });
    const out = await bdCrawlScrape({ url: 'https://example.com' }, fetchImpl);
    expect(out.results.items).toHaveLength(1);
    expect((out.results.items[0] as { markdown: string }).markdown).toBe('# Solo');
  });

  it('malformed path: 2xx with non-JSON body throws BdRequestError', async () => {
    const fetchImpl = mockFetch('<html>not json</html>', { status: 200 });
    await expect(bdCrawlScrape({ url: 'https://example.com' }, fetchImpl)).rejects.toBeInstanceOf(BdRequestError);
  });

  it('error path: non-2xx throws BdRequestError', async () => {
    const fetchImpl = mockFetch('forbidden', { status: 403 });
    await expect(bdCrawlScrape({ url: 'https://example.com' }, fetchImpl)).rejects.toMatchObject({
      name: 'BdRequestError',
      status: 403,
    });
  });

  it('config error: missing dataset id throws BdConfigError before any fetch', async () => {
    vi.stubEnv('BRIGHTDATA_CRAWL_DATASET_ID', '');
    const fetchImpl = mockFetch(CRAWL_ARRAY, { status: 200 });
    await expect(bdCrawlScrape({ url: 'https://example.com' }, fetchImpl)).rejects.toBeInstanceOf(BdConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

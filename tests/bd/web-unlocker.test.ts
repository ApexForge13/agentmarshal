// Bright Data Web Unlocker client unit tests (Bubble 18) — mocked fetch, no real
// calls. The live round-trip lives in tests/integration/mcp-bd-roundtrip.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bdWebUnlockerFetch, BdConfigError, BdRequestError } from '@/lib/bd/client';

function mockFetch(body: string, init: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

function sentBodyOf(fetchImpl: typeof fetch): Record<string, unknown> {
  const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

const HTML = '<html><body><h1>Reuters article</h1></body></html>';

describe('bdWebUnlockerFetch (Bubble 18)', () => {
  beforeEach(() => {
    vi.stubEnv('BRIGHTDATA_API_TOKEN', 'test-token-xyz');
    vi.stubEnv('BRIGHTDATA_UNLOCKER_ZONE', 'test_unlocker_zone');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path: returns content + raw + request id, posts zone/url/format to /request', async () => {
    const fetchImpl = mockFetch(HTML, { status: 200, headers: { 'x-brd-request-id': 'req-unlock-1' } });
    const out = await bdWebUnlockerFetch({ url: 'https://www.reuters.com/article' }, fetchImpl);

    expect(out.status).toBe(200);
    expect(out.raw).toBe(HTML);
    expect(out.results.content).toBe(HTML);
    expect(out.bd_request_id).toBe('req-unlock-1');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toBe('https://api.brightdata.com/request');
    expect((init as RequestInit).method).toBe('POST');
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer test-token-xyz');
    const body = sentBodyOf(fetchImpl);
    expect(body.zone).toBe('test_unlocker_zone');
    expect(body.url).toBe('https://www.reuters.com/article');
    expect(body.format).toBe('raw');
  });

  it('forwards country when provided', async () => {
    const fetchImpl = mockFetch(HTML, { status: 200 });
    await bdWebUnlockerFetch({ url: 'https://www.ft.com/x', country: 'gb' }, fetchImpl);
    expect(sentBodyOf(fetchImpl).country).toBe('gb');
  });

  it('BD envelope error: HTTP 200 + x-brd-status-code surfaces the upstream reason', async () => {
    const fetchImpl = mockFetch('', {
      status: 200,
      headers: { 'x-brd-status-code': '403', 'x-brd-err-msg': 'blocked by target site' },
    });
    await expect(bdWebUnlockerFetch({ url: 'https://www.wsj.com/x' }, fetchImpl)).rejects.toMatchObject({
      name: 'BdRequestError',
      status: 403,
    });
  });

  it('error path: non-2xx throws BdRequestError carrying status', async () => {
    const fetchImpl = mockFetch('unauthorized', { status: 401 });
    await expect(bdWebUnlockerFetch({ url: 'https://x.reuters.com' }, fetchImpl)).rejects.toMatchObject({
      name: 'BdRequestError',
      status: 401,
    });
  });

  it('config error: missing unlocker zone throws BdConfigError before any fetch', async () => {
    vi.stubEnv('BRIGHTDATA_UNLOCKER_ZONE', '');
    const fetchImpl = mockFetch(HTML, { status: 200 });
    await expect(bdWebUnlockerFetch({ url: 'https://www.reuters.com' }, fetchImpl)).rejects.toBeInstanceOf(
      BdConfigError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

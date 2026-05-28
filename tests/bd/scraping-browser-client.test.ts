// Bright Data Scraping Browser client unit tests (Bubble 20) — hermetic via an
// injected fake CDP browser (no real WebSocket). The live round-trip lives in
// tests/integration/mcp-bd-roundtrip.test.ts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { bdScrapingBrowserBrowse, type BrowserConnect } from '@/lib/bd/scraping-browser-client';
import { BdConfigError } from '@/lib/bd/client';
import type { Browser } from 'puppeteer-core';

const HTML = '<html><body><h1>Companies House: ACME TRADING LTD</h1></body></html>';
const REGISTRY_URL = 'https://find-and-update.company-information.service.gov.uk/company/12345678';

function fakeBrowser(pageOverrides: Record<string, unknown> = {}) {
  const page = {
    goto: vi.fn(async () => null),
    waitForSelector: vi.fn(async () => ({})),
    content: vi.fn(async () => HTML),
    close: vi.fn(async () => {}),
    ...pageOverrides,
  };
  const browser = {
    newPage: vi.fn(async () => page),
    disconnect: vi.fn(async () => {}),
  };
  return { browser, page };
}

function stubCreds() {
  vi.stubEnv('BRIGHTDATA_BROWSER_USER', 'brd-customer-test-zone-scraping_browser1');
  vi.stubEnv('BRIGHTDATA_BROWSER_PASS', 'test-pass');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bdScrapingBrowserBrowse (Bubble 20)', () => {
  it('connects to the CDP ws endpoint, navigates, returns rendered HTML, disconnects (not close)', async () => {
    stubCreds();
    const { browser, page } = fakeBrowser();
    const connect: BrowserConnect = vi.fn(async () => browser as unknown as Browser);
    const out = await bdScrapingBrowserBrowse({ url: REGISTRY_URL }, connect);

    expect(out.status).toBe(200);
    expect(out.raw).toBe(HTML);
    expect(out.results.content).toBe(HTML);
    expect(out.results.url).toBe(REGISTRY_URL);

    const endpoint = (connect as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].browserWSEndpoint;
    expect(endpoint).toBe('wss://brd-customer-test-zone-scraping_browser1:test-pass@brd.superproxy.io:9222');
    expect(page.goto).toHaveBeenCalledWith(REGISTRY_URL, expect.objectContaining({ waitUntil: 'domcontentloaded' }));
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('waits for a selector when wait_for_selector is provided', async () => {
    stubCreds();
    const { browser, page } = fakeBrowser();
    await bdScrapingBrowserBrowse(
      { url: REGISTRY_URL, wait_for_selector: '#company-name' },
      async () => browser as unknown as Browser,
    );
    expect(page.waitForSelector).toHaveBeenCalledWith('#company-name', expect.any(Object));
  });

  it('disconnects even when navigation throws', async () => {
    stubCreds();
    const { browser } = fakeBrowser({
      goto: vi.fn(async () => {
        throw new Error('Navigation timeout exceeded');
      }),
    });
    await expect(
      bdScrapingBrowserBrowse({ url: REGISTRY_URL }, async () => browser as unknown as Browser),
    ).rejects.toThrow('Navigation timeout');
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
  });

  it('config error: missing BROWSER_USER throws BdConfigError before connecting', async () => {
    vi.stubEnv('BRIGHTDATA_BROWSER_USER', '');
    vi.stubEnv('BRIGHTDATA_BROWSER_PASS', 'test-pass');
    const connect = vi.fn();
    await expect(bdScrapingBrowserBrowse({ url: REGISTRY_URL }, connect as never)).rejects.toBeInstanceOf(
      BdConfigError,
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it('config error: missing BROWSER_PASS throws BdConfigError', async () => {
    vi.stubEnv('BRIGHTDATA_BROWSER_USER', 'brd-customer-x-zone-scraping_browser1');
    vi.stubEnv('BRIGHTDATA_BROWSER_PASS', '');
    await expect(bdScrapingBrowserBrowse({ url: REGISTRY_URL }, vi.fn() as never)).rejects.toBeInstanceOf(
      BdConfigError,
    );
  });
});

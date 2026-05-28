// Bright Data Scraping Browser client (Bubble 20 Phase C).
//
// SEPARATE from lib/bd/client.ts because the transport is fundamentally different:
// Scraping Browser is a REMOTE browser driven over CDP/WebSocket (not the Bearer
// /request REST API — Bubble 18 confirmed a browser zone returns 403 on /request).
// We connect puppeteer-core (the connect-only variant, no bundled Chromium) to BD's
// CDP endpoint, navigate, capture the rendered HTML, then disconnect (NOT close —
// leave BD's remote browser running).
//
// Credentials are the zone username/password (NOT the API token + zone-name):
//   wss://${BRIGHTDATA_BROWSER_USER}:${BRIGHTDATA_BROWSER_PASS}@brd.superproxy.io:9222
//
// `connect` is injectable so unit tests run hermetically against a fake browser.

import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { BdConfigError } from './client';

const BD_BROWSER_CDP_HOST = 'brd.superproxy.io:9222';
const DEFAULT_TIMEOUT_MS = 30_000;

/** Connects to a CDP browser over a WebSocket endpoint. Injectable for tests. */
export type BrowserConnect = (options: { browserWSEndpoint: string }) => Promise<Browser>;

export interface BdScrapingBrowserParams {
  /** Absolute URL to load in the remote browser. */
  url: string;
  /** Optional selector to wait for after navigation (JS-rendered content). */
  wait_for_selector?: string;
  /** Navigation/selector timeout; default 30s (Scraping Browser is slow). */
  timeout_ms?: number;
}

export interface BdScrapingBrowserResult {
  results: { content: string; url: string; status: number };
  /** The rendered HTML — the fingerprint substrate. */
  raw: string;
  bd_request_id: string | null;
  status: number;
}

/** Builds the CDP WebSocket endpoint from the zone username/password. */
function buildBrowserWSEndpoint(): string {
  const user = process.env.BRIGHTDATA_BROWSER_USER;
  const pass = process.env.BRIGHTDATA_BROWSER_PASS;
  if (!user) throw new BdConfigError('BRIGHTDATA_BROWSER_USER is not set');
  if (!pass) throw new BdConfigError('BRIGHTDATA_BROWSER_PASS is not set');
  return `wss://${user}:${pass}@${BD_BROWSER_CDP_HOST}`;
}

/**
 * Loads a URL through BD's Scraping Browser (CDP) and returns the rendered HTML.
 * Throws BdConfigError when the browser credentials are missing (before connecting).
 * Always disconnects (never closes BD's remote browser) via try/finally.
 */
export async function bdScrapingBrowserBrowse(
  params: BdScrapingBrowserParams,
  connect: BrowserConnect = (options) => puppeteer.connect(options),
): Promise<BdScrapingBrowserResult> {
  const browserWSEndpoint = buildBrowserWSEndpoint();
  const timeout = params.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  const browser = await connect({ browserWSEndpoint });
  let page: Page | undefined;
  try {
    page = await browser.newPage();
    await page.goto(params.url, { waitUntil: 'domcontentloaded', timeout });
    if (params.wait_for_selector) {
      await page.waitForSelector(params.wait_for_selector, { timeout });
    }
    const content = await page.content();
    return {
      results: { content, url: params.url, status: 200 },
      raw: content,
      bd_request_id: null,
      status: 200,
    };
  } finally {
    // Close our page, then drop our connection — leave BD's remote browser alone.
    if (page) {
      try {
        await page.close();
      } catch {
        /* best-effort */
      }
    }
    try {
      await browser.disconnect();
    } catch {
      /* best-effort */
    }
  }
}

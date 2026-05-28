// BD MCP passthrough client unit tests (Bubble 20) — hermetic via an injected session
// (no real MCP connection). The live round-trip lives in tests/integration/mcp-bd-roundtrip.test.ts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { bdMcpPassthroughCall, bdMcpListTools, type BdMcpSession } from '@/lib/bd/mcp-passthrough-client';
import { BdConfigError } from '@/lib/bd/client';

function fakeSession(overrides: Partial<BdMcpSession> = {}): BdMcpSession {
  return {
    callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
    listTools: vi.fn(async () => ({ tools: [{ name: 'search_engine' }, { name: 'scrape_as_markdown' }] })),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bdMcpPassthroughCall (Bubble 20)', () => {
  it('forwards the tools/call via the session, wraps result + raw, and closes', async () => {
    const session = fakeSession();
    const out = await bdMcpPassthroughCall(
      { bd_tool_name: 'search_engine', bd_tool_input: { query: 'acme corp' } },
      async () => session,
    );
    expect(out.status).toBe(200);
    expect(out.results).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(out.raw).toBe(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
    expect(session.callTool).toHaveBeenCalledWith({ name: 'search_engine', arguments: { query: 'acme corp' } });
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('defaults bd_tool_input to {} when omitted', async () => {
    const session = fakeSession();
    await bdMcpPassthroughCall({ bd_tool_name: 'search_engine' }, async () => session);
    expect(session.callTool).toHaveBeenCalledWith({ name: 'search_engine', arguments: {} });
  });

  it('closes the session even when the call throws', async () => {
    const session = fakeSession({
      callTool: vi.fn(async () => {
        throw new Error('mcp upstream error');
      }),
    });
    await expect(bdMcpPassthroughCall({ bd_tool_name: 'x' }, async () => session)).rejects.toThrow(
      'mcp upstream error',
    );
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('config error: missing token throws BdConfigError before connecting (default connect)', async () => {
    vi.stubEnv('BRIGHTDATA_API_TOKEN', '');
    await expect(bdMcpPassthroughCall({ bd_tool_name: 'search_engine' })).rejects.toBeInstanceOf(BdConfigError);
  });
});

describe('bdMcpListTools (Bubble 20)', () => {
  it('returns the BD MCP tool names and closes', async () => {
    const session = fakeSession();
    const out = await bdMcpListTools(async () => session);
    expect(out).toEqual(['search_engine', 'scrape_as_markdown']);
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});

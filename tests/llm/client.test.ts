// AI/ML API client unit tests (Bubble 22) — mocked fetch, no real calls.
// The live AI/ML API round-trip lives in the gated integration test
// (tests/integration/adverse-media-llm-live.test.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  aimlChatCompletion,
  AIML_DEFAULT_MODEL,
  LlmConfigError,
  LlmRequestError,
} from '@/lib/llm/client';

function mockFetch(body: string, init: ResponseInit = { status: 200 }): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

const SAMPLE_OK = JSON.stringify({
  id: 'chatcmpl-1',
  object: 'chat.completion',
  model: 'gpt-4.1-mini-2025-04-14',
  choices: [
    { index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' },
  ],
  usage: { prompt_tokens: 26, completion_tokens: 5, total_tokens: 31 },
  meta: { usage: { credits_used: 49, usd_spent: 0.0000245 } },
});

describe('aimlChatCompletion (Bubble 22)', () => {
  beforeEach(() => {
    vi.stubEnv('AIML_API_KEY', 'test-aiml-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path: posts to AI/ML chat-completions with bearer auth + body, parses content + cost + tokens', async () => {
    const fetchImpl = mockFetch(SAMPLE_OK);

    const out = await aimlChatCompletion({
      messages: [
        { role: 'system', content: 'system msg' },
        { role: 'user', content: 'user msg' },
      ],
      response_format: { type: 'json_object' },
      fetchImpl,
    });

    expect(out.content).toBe('{"ok":true}');
    expect(out.model).toBe('gpt-4.1-mini-2025-04-14');
    expect(out.cost).toEqual({ credits_used: 49, usd_spent: 0.0000245 });
    expect(out.tokens).toEqual({ prompt: 26, completion: 5, total: 31 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.aimlapi.com/v1/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-aiml-key');
    expect(headers['Content-Type']).toBe('application/json');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe(AIML_DEFAULT_MODEL);
    expect(sent.messages).toHaveLength(2);
    expect(sent.response_format).toEqual({ type: 'json_object' });
  });

  it('honors a custom model + omits response_format when not set', async () => {
    const fetchImpl = mockFetch(SAMPLE_OK);
    await aimlChatCompletion({
      messages: [{ role: 'user', content: 'x' }],
      model: 'openai/gpt-4o',
      fetchImpl,
    });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe('openai/gpt-4o');
    expect(sent.response_format).toBeUndefined();
  });

  it('missing key throws LlmConfigError before any fetch', async () => {
    vi.stubEnv('AIML_API_KEY', '');
    const fetchImpl = mockFetch(SAMPLE_OK);
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toBeInstanceOf(LlmConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('non-2xx throws LlmRequestError carrying status + body', async () => {
    const fetchImpl = mockFetch('unauthorized', { status: 401 });
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toMatchObject({ name: 'LlmRequestError', status: 401 });
  });

  it('empty body on 2xx throws LlmRequestError', async () => {
    const fetchImpl = mockFetch('', { status: 200 });
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('non-JSON body throws LlmRequestError', async () => {
    const fetchImpl = mockFetch('<html>captcha</html>', { status: 200 });
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('JSON with no choices throws LlmRequestError', async () => {
    const fetchImpl = mockFetch(JSON.stringify({ id: 'x', choices: [] }), { status: 200 });
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('choices without string content throws LlmRequestError', async () => {
    const fetchImpl = mockFetch(
      JSON.stringify({ choices: [{ message: { role: 'assistant' } }] }),
      { status: 200 },
    );
    await expect(
      aimlChatCompletion({ messages: [{ role: 'user', content: 'x' }], fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('timeout: aborted fetch throws LlmRequestError mentioning the timeout', async () => {
    // The injected fetch waits past the request timeout, then resolves; the
    // AbortController inside aimlChatCompletion fires first and we surface that.
    const fetchImpl = ((url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as unknown as typeof fetch;

    await expect(
      aimlChatCompletion({
        messages: [{ role: 'user', content: 'x' }],
        timeout_ms: 20,
        fetchImpl,
      }),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it('graceful telemetry: missing meta.usage / usage fields parse as nulls, not throws', async () => {
    const body = JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
    });
    const fetchImpl = mockFetch(body, { status: 200 });
    const out = await aimlChatCompletion({
      messages: [{ role: 'user', content: 'x' }],
      fetchImpl,
    });
    expect(out.content).toBe('hi');
    expect(out.cost).toEqual({ credits_used: null, usd_spent: null });
    expect(out.tokens).toEqual({ prompt: null, completion: null, total: null });
    expect(out.model).toBeNull();
  });
});

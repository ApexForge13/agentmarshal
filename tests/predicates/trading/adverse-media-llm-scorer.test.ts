// LLM adverse-media scorer unit tests (Bubble 22) — mocked fetch, no real LLM call.
// The live AI/ML API path is exercised by the gated integration test
// (tests/integration/adverse-media-llm-live.test.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scoreAdverseMediaWithLlm,
  CONTENT_CHAR_BUDGET,
} from '@/lib/compliance/predicates/trading/adverse-media-llm-scorer';
import { LlmRequestError } from '@/lib/llm/client';

/** Wraps a structured payload as an AI/ML chat-completions response body. */
function aimlBody(contentJson: object | string): string {
  const content = typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson);
  return JSON.stringify({
    id: 'chatcmpl-test',
    model: 'gpt-4.1-mini-2025-04-14',
    choices: [
      { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
    meta: { usage: { credits_used: 250, usd_spent: 0.000125 } },
  });
}

function mockFetch(body: string, init: ResponseInit = { status: 200 }): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv('AIML_API_KEY', 'test-aiml-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('scoreAdverseMediaWithLlm (Bubble 22)', () => {
  it('PASS verdict: clean content, empty concerns, captures model + cost', async () => {
    const fetchImpl = mockFetch(
      aimlBody({
        verdict: 'pass',
        reasoning: 'No adverse media about this entity in the content.',
        concerns: [],
      }),
    );
    const out = await scoreAdverseMediaWithLlm({
      entity_name: 'Northwind Artisanal Stationery',
      content: 'Quarterly earnings beat estimates; the board approved a dividend.',
      fetchImpl,
    });
    expect(out.verdict).toBe('pass');
    expect(out.reasoning).toMatch(/no adverse media/i);
    expect(out.concerns).toEqual([]);
    expect(out.model).toBe('gpt-4.1-mini-2025-04-14');
    expect(out.cost).toEqual({ credits_used: 250, usd_spent: 0.000125 });
    expect(out.content_truncated).toBe(false);
  });

  it('REVIEW verdict: ambiguous signal carries concerns array', async () => {
    const fetchImpl = mockFetch(
      aimlBody({
        verdict: 'review',
        reasoning: 'Unverified report of an internal probe; analyst should confirm.',
        concerns: ['unverified internal probe'],
      }),
    );
    const out = await scoreAdverseMediaWithLlm({
      entity_name: 'Acme Corp',
      content: 'An internal probe is reportedly underway, sources said.',
      fetchImpl,
    });
    expect(out.verdict).toBe('review');
    expect(out.concerns).toEqual(['unverified internal probe']);
  });

  it('FAIL verdict: strong specific adverse media', async () => {
    const fetchImpl = mockFetch(
      aimlBody({
        verdict: 'fail',
        reasoning:
          'SEC indicted Acme Corp executives for fraud and ordered an asset freeze.',
        concerns: ['SEC indictment', 'asset freeze', 'fraud'],
      }),
    );
    const out = await scoreAdverseMediaWithLlm({
      entity_name: 'Acme Corp',
      content: 'The SEC unsealed an indictment against Acme Corp executives.',
      fetchImpl,
    });
    expect(out.verdict).toBe('fail');
    expect(out.concerns).toHaveLength(3);
  });

  it('sends the entity name + content as the user message and uses JSON mode + temperature=0', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'pass', reasoning: 'clean', concerns: [] }),
    );
    await scoreAdverseMediaWithLlm({
      entity_name: 'ENT-X',
      content: 'some body text',
      fetchImpl,
    });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.temperature).toBe(0);
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[0].content).toMatch(/financial-crime adverse media/);
    expect(sent.messages[1].role).toBe('user');
    expect(sent.messages[1].content).toContain('Entity: ENT-X');
    expect(sent.messages[1].content).toContain('some body text');
  });

  it('honors a custom model override', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'pass', reasoning: 'clean', concerns: [] }),
    );
    await scoreAdverseMediaWithLlm({
      entity_name: 'X',
      content: 'y',
      model: 'openai/gpt-4o',
      fetchImpl,
    });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe('openai/gpt-4o');
  });

  it('truncates content over the character budget and records the truncation', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'pass', reasoning: 'clean', concerns: [] }),
    );
    const huge = 'a'.repeat(CONTENT_CHAR_BUDGET + 5000);
    const out = await scoreAdverseMediaWithLlm({
      entity_name: 'X',
      content: huge,
      fetchImpl,
    });
    expect(out.content_truncated).toBe(true);
    expect(out.content_chars_sent).toBe(CONTENT_CHAR_BUDGET);
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.messages[1].content.length).toBeLessThan(huge.length);
  });

  it('throws LlmRequestError on non-JSON model content', async () => {
    const fetchImpl = mockFetch(aimlBody('not JSON, just prose'));
    await expect(
      scoreAdverseMediaWithLlm({ entity_name: 'X', content: 'y', fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('throws LlmRequestError when verdict is missing or invalid', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'maybe', reasoning: 'x', concerns: [] }),
    );
    await expect(
      scoreAdverseMediaWithLlm({ entity_name: 'X', content: 'y', fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('throws LlmRequestError when reasoning is empty or missing', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'pass', reasoning: '', concerns: [] }),
    );
    await expect(
      scoreAdverseMediaWithLlm({ entity_name: 'X', content: 'y', fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('throws LlmRequestError when concerns is not an array', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'pass', reasoning: 'x', concerns: 'oops' }),
    );
    await expect(
      scoreAdverseMediaWithLlm({ entity_name: 'X', content: 'y', fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it('drops non-string entries inside concerns', async () => {
    const fetchImpl = mockFetch(
      aimlBody({ verdict: 'review', reasoning: 'x', concerns: ['real', 7, null, '', 'also'] }),
    );
    const out = await scoreAdverseMediaWithLlm({
      entity_name: 'X',
      content: 'y',
      fetchImpl,
    });
    expect(out.concerns).toEqual(['real', 'also']);
  });
});

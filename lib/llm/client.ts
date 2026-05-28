// AI/ML API client (Bubble 22) — OpenAI-compatible chat-completions gateway.
//
// AI/ML API exposes a standard OpenAI chat-completions API at
//   POST https://api.aimlapi.com/v1/chat/completions
// authenticated with `Authorization: Bearer ${AIML_API_KEY}`. Request and response
// shapes are byte-identical to OpenAI's; the one provider-specific addition is the
// top-level `meta.usage` envelope ({credits_used, usd_spent}) which we surface for
// cost telemetry so the audit record can show what the LLM call actually charged.
//
// `fetchImpl` is injectable so tests mock the HTTP layer without stubbing global
// fetch; production callers use the default. Timeout is enforced via AbortController.
//
// The default model `openai/gpt-4.1-mini` was confirmed live during Phase 1 discovery
// (HTTP 200, ~1.4s, clean JSON-mode output, resolved as gpt-4.1-mini-2025-04-14).

import type {
  LlmChatRequest,
  LlmChatResponse,
  LlmCostUsage,
} from './types';

const AIML_CHAT_ENDPOINT = 'https://api.aimlapi.com/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 20_000;

/** Thrown when LLM credentials are not configured. */
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}

/** Thrown when the LLM request fails (non-2xx, timeout, or malformed response body). */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

const EMPTY_COST: LlmCostUsage = { credits_used: null, usd_spent: null };

/** Reads `meta.usage` from the raw AI/ML response, falling back to nulls. */
function readCostUsage(parsed: unknown): LlmCostUsage {
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_COST;
  const meta = (parsed as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return EMPTY_COST;
  const usage = (meta as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) return EMPTY_COST;
  const u = usage as Record<string, unknown>;
  return {
    credits_used: typeof u.credits_used === 'number' ? u.credits_used : null,
    usd_spent: typeof u.usd_spent === 'number' ? u.usd_spent : null,
  };
}

/** Reads `usage` from the raw OpenAI-compatible response, falling back to nulls. */
function readTokenUsage(parsed: unknown): LlmChatResponse['tokens'] {
  if (typeof parsed !== 'object' || parsed === null) {
    return { prompt: null, completion: null, total: null };
  }
  const usage = (parsed as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) {
    return { prompt: null, completion: null, total: null };
  }
  const u = usage as Record<string, unknown>;
  return {
    prompt: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null,
    completion: typeof u.completion_tokens === 'number' ? u.completion_tokens : null,
    total: typeof u.total_tokens === 'number' ? u.total_tokens : null,
  };
}

/**
 * Calls AI/ML API's chat-completions endpoint and returns the assistant content
 * plus cost + token telemetry. The caller is responsible for any JSON parsing of
 * the content string (the LLM scorer wraps that in try/catch + structural
 * validation, throwing LlmRequestError on malformed structured output).
 *
 * Throws LlmConfigError when AIML_API_KEY is missing (no fetch attempted),
 * LlmRequestError on non-2xx, timeout, empty body, missing choices, or non-string
 * assistant content.
 */
export async function aimlChatCompletion(
  request: LlmChatRequest,
): Promise<LlmChatResponse> {
  const apiKey = process.env.AIML_API_KEY;
  if (!apiKey) throw new LlmConfigError('AIML_API_KEY is not set');

  const fetchImpl = request.fetchImpl ?? fetch;
  const timeoutMs = request.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const model = request.model ?? DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
  };
  if (request.response_format) body.response_format = request.response_format;
  if (request.temperature !== undefined) body.temperature = request.temperature;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(AIML_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmRequestError(`AI/ML API request timed out after ${timeoutMs}ms`, 0, '');
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new LlmRequestError(`AI/ML API request failed: ${message}`, 0, '');
  }
  clearTimeout(timer);

  const raw = await res.text();

  if (!res.ok) {
    throw new LlmRequestError(
      `AI/ML API request failed: HTTP ${res.status}`,
      res.status,
      raw.slice(0, 2000),
    );
  }

  if (raw.length === 0) {
    throw new LlmRequestError('AI/ML API returned an empty response body', res.status, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmRequestError(
      'AI/ML API response was not valid JSON',
      res.status,
      raw.slice(0, 2000),
    );
  }

  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new LlmRequestError(
      'AI/ML API response had no choices',
      res.status,
      raw.slice(0, 2000),
    );
  }
  const message = (choices[0] as { message?: unknown }).message;
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content !== 'string') {
    throw new LlmRequestError(
      'AI/ML API response had no message content',
      res.status,
      raw.slice(0, 2000),
    );
  }

  const resolvedModel = (parsed as { model?: unknown }).model;
  return {
    content,
    model: typeof resolvedModel === 'string' ? resolvedModel : null,
    cost: readCostUsage(parsed),
    tokens: readTokenUsage(parsed),
  };
}

export { DEFAULT_MODEL as AIML_DEFAULT_MODEL };

// HTTP client for the Lobster Trap sidecar.
//
// Reality check after reading ../lobstertrap/internal/proxy/proxy.go:
// LT does NOT expose a dedicated /v1/inspect endpoint. It is a reverse proxy
// that intercepts OpenAI-compatible chat-completion endpoints (e.g.
// /v1/chat/completions), runs ingress DPI on the prompt text, and either
// returns a deny response (still HTTP 200 with the LT verdict in the body)
// or forwards to a backend LLM. In both cases LT injects its inspection
// report into the response body under `_lobstertrap.ingress.detected`,
// which has the exact shape of our LobsterTrapMetadata type.
//
// `inspect()` therefore POSTs a minimal chat-completion request to LT and
// pulls `_lobstertrap.ingress.detected` out of the response. For RED prompts
// LT denies at ingress before ever calling the backend, so this is cheap.
// For ALLOW prompts LT will forward to its configured backend — callers that
// only want metadata without a downstream LLM call should arrange for LT to
// be configured against a backend they don't mind hitting.

import type { LobsterTrapMetadata } from '@/types';

const DEFAULT_BASE = 'http://localhost:8080';
const DEFAULT_CHAT_PATH = '/v1/chat/completions';

export function proxyUrl(): string {
  return process.env.LT_PROXY_URL ?? DEFAULT_BASE;
}

export function chatPath(): string {
  return process.env.LT_CHAT_PATH ?? DEFAULT_CHAT_PATH;
}

interface LTIngressEnvelope {
  ingress?: {
    detected?: LobsterTrapMetadata;
  };
}

interface LTChatResponse {
  _lobstertrap?: LTIngressEnvelope;
}

export async function inspect(text: string): Promise<LobsterTrapMetadata> {
  // LT path-passthrough: LT's reverse proxy preserves the request path when
  // forwarding to the backend. For Groq (path /openai/v1/chat/completions)
  // we need LT_CHAT_PATH overridden; for local Ollama the default is fine.
  const url = `${proxyUrl()}${chatPath()}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Force uncompressed upstream responses. Go's ReverseProxy forwards our
    // Accept-Encoding to the backend, which means Groq returns gzip. LT's
    // metadata injector then can't parse the body and falls back to passing
    // the bare upstream bytes through, stripping the _lobstertrap envelope.
    'Accept-Encoding': 'identity',
  };
  // When LT_API_KEY is set (Fly/prod), pass it through so LT can forward
  // it as the upstream auth (e.g. Groq). Unset in local dev with Ollama.
  if (process.env.LT_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.LT_API_KEY}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: process.env.LT_MODEL ?? 'llama3.2:1b',
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (err) {
    throw new Error(
      `Lobster Trap unreachable at ${url}: ${(err as Error).message}`,
    );
  }

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(
      `Lobster Trap returned ${res.status} from ${url}: ${bodyText.slice(0, 200)}`,
    );
  }

  let parsed: LTChatResponse;
  try {
    parsed = JSON.parse(bodyText) as LTChatResponse;
  } catch (err) {
    throw new Error(
      `Lobster Trap returned non-JSON body from ${url}: ${(err as Error).message}`,
    );
  }

  const detected = parsed._lobstertrap?.ingress?.detected;
  if (!detected) {
    throw new Error(
      `Lobster Trap response missing _lobstertrap.ingress.detected from ${url}: ${bodyText.slice(0, 200)}`,
    );
  }

  return detected;
}

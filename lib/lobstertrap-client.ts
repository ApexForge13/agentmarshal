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

export function proxyUrl(): string {
  return process.env.LT_PROXY_URL ?? DEFAULT_BASE;
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
  const url = `${proxyUrl()}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

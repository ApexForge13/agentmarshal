// LLM gateway types (Bubble 22).
//
// AI/ML API is OpenAI-compatible: request and response shapes match the standard
// OpenAI chat-completions schema. These types describe only the fields the
// AgentMarshal client actually reads — keeping the surface tight and resilient to
// non-breaking provider additions. AI/ML API additionally returns `meta.usage`
// (credits_used + usd_spent) for cost telemetry, which we surface for audit.
//
// The interface is deliberately generic: swapping to direct OpenAI, Groq, or any
// other OpenAI-compatible gateway later does not touch the scorer or composite.

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmResponseFormat {
  type: 'json_object' | 'text';
}

export interface LlmChatRequest {
  /** OpenAI-compatible messages array. */
  messages: LlmMessage[];
  /** Model identifier (provider-specific). Default: openai/gpt-4.1-mini. */
  model?: string;
  /** Forces JSON output when set to `{ type: 'json_object' }`. */
  response_format?: LlmResponseFormat;
  /** Request timeout in milliseconds. Default: 20000. */
  timeout_ms?: number;
  /** Injectable fetch (test seam). Default: global fetch. */
  fetchImpl?: typeof fetch;
  /** Sampling temperature. Default: provider default. */
  temperature?: number;
}

/** Cost telemetry from AI/ML API's `meta.usage` envelope (best-effort; provider-specific). */
export interface LlmCostUsage {
  credits_used: number | null;
  usd_spent: number | null;
}

export interface LlmChatResponse {
  /** Assistant message content from `choices[0].message.content`. */
  content: string;
  /** Resolved model name from the response (provider may rewrite the requested id). */
  model: string | null;
  /** Cost telemetry if the provider returned one. */
  cost: LlmCostUsage;
  /** Standard OpenAI token usage if returned. */
  tokens: {
    prompt: number | null;
    completion: number | null;
    total: number | null;
  };
}

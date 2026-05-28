// LLM-based adverse media scorer (Bubble 22).
//
// Replaces the Bubble 19 keyword heuristic (which counts distinct financial-crime
// terms in the article content) with an LLM that READS the content and decides
// whether the named entity is actually the subject of adverse media. This fixes
// the documented Bubble 19 false-positive: keyword counting fires when a similarly
// named or unrelated entity is the actual subject, e.g. "Meridian Corp" name
// collisions. The LLM's job is to distinguish those, plus produce a one-sentence
// human-readable reasoning string that lands in the SIGNED audit record alongside
// the verdict — the central "the receipt proves what you knew when you decided"
// thesis is stronger when the reason is sentence-level, not a keyword count.
//
// The function returns `{verdict, reasoning, concerns}`; the composite consumes
// that into `result` + `reason` + `details`. JSON-mode (`response_format`) is
// requested, but the parse + structural validation are still defensive — on any
// malformed output we throw LlmRequestError so the composite's fallback (keyword
// scoring or screening_unavailable, depending on scoring_mode) takes over.

import { aimlChatCompletion, AIML_DEFAULT_MODEL, LlmRequestError } from '@/lib/llm/client';
import type { LlmCostUsage } from '@/lib/llm/types';

/** Final-form three-state verdict. Mirrors the keyword scorer + composite. */
export type AdverseMediaVerdict = 'pass' | 'review' | 'fail';

export interface AdverseMediaLlmScoreInput {
  entity_name: string;
  /** Aggregated article text from the Crawl chain (will be truncated). */
  content: string;
  /** Override the default model. */
  model?: string;
  /** Injectable fetch (test seam). */
  fetchImpl?: typeof fetch;
}

export interface AdverseMediaLlmScoreResult {
  verdict: AdverseMediaVerdict;
  reasoning: string;
  concerns: string[];
  /** Resolved model name from the response (provider may rewrite the requested id). */
  model: string | null;
  /** Cost telemetry from the call (best-effort, provider-specific). */
  cost: LlmCostUsage;
  /** True when input content was truncated to fit the budget. */
  content_truncated: boolean;
  /** Character length actually sent to the model after truncation. */
  content_chars_sent: number;
}

/** Character budget for the article-content block sent to the model. */
export const CONTENT_CHAR_BUDGET = 6000;

const SYSTEM_MESSAGE = [
  'You are a financial-crime adverse media screening assistant for a compliance team.',
  'Given article content about a named entity, determine whether the content describes',
  'ADVERSE MEDIA specifically involving that entity: financial crime, fraud, regulatory',
  'action, sanctions, money laundering, indictment, asset freeze, bribery, or criminal',
  'charges.',
  '',
  'Critical rules:',
  '- The adverse conduct must involve THE NAMED ENTITY, not merely appear in the article.',
  '  An article that mentions "fraud" in an unrelated context, or that describes a',
  '  DIFFERENT entity with a similar name, is NOT adverse media for this entity.',
  '- Distinguish the named entity from similarly-named organizations (name collisions).',
  '',
  'Return ONLY a JSON object, no prose:',
  '{',
  '  "verdict": "pass" | "review" | "fail",',
  '  "reasoning": "<one clear sentence explaining the verdict>",',
  '  "concerns": ["<specific concern>", ...]   // empty array if none',
  '}',
  '',
  'verdict guide:',
  '- "fail": strong, specific adverse media clearly about this entity.',
  '- "review": ambiguous, indirect, or unverified signal a human analyst should check.',
  '- "pass": no adverse media about this entity in the content.',
].join('\n');

function buildUserMessage(entityName: string, content: string): string {
  return `Entity: ${entityName}\n\nContent:\n${content}`;
}

/**
 * Validates the model's structured output. Returns the typed result on success;
 * returns `null` on any structural problem (caller throws LlmRequestError).
 */
function validateStructuredOutput(
  raw: unknown,
): { verdict: AdverseMediaVerdict; reasoning: string; concerns: string[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const verdict = r.verdict;
  const reasoning = r.reasoning;
  const concerns = r.concerns;

  if (verdict !== 'pass' && verdict !== 'review' && verdict !== 'fail') return null;
  if (typeof reasoning !== 'string' || reasoning.length === 0) return null;
  if (!Array.isArray(concerns)) return null;
  // Concerns must be strings (or normalise empty/non-string out).
  const cleanedConcerns: string[] = [];
  for (const c of concerns) {
    if (typeof c === 'string' && c.length > 0) cleanedConcerns.push(c);
  }
  return { verdict, reasoning, concerns: cleanedConcerns };
}

/**
 * Scores an entity + content pair via the AI/ML API LLM. Throws LlmRequestError on
 * any LLM call failure, timeout, or malformed structured output so the composite's
 * fallback policy can take over.
 */
export async function scoreAdverseMediaWithLlm(
  input: AdverseMediaLlmScoreInput,
): Promise<AdverseMediaLlmScoreResult> {
  const truncated = input.content.length > CONTENT_CHAR_BUDGET;
  const contentForModel = truncated
    ? input.content.slice(0, CONTENT_CHAR_BUDGET)
    : input.content;
  const userMessage = buildUserMessage(input.entity_name, contentForModel);

  const response = await aimlChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: userMessage },
    ],
    model: input.model ?? AIML_DEFAULT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0,
    fetchImpl: input.fetchImpl,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new LlmRequestError(
      'LLM adverse-media response was not valid JSON',
      0,
      response.content.slice(0, 2000),
    );
  }

  const validated = validateStructuredOutput(parsed);
  if (validated === null) {
    throw new LlmRequestError(
      'LLM adverse-media response did not match the required structure',
      0,
      response.content.slice(0, 2000),
    );
  }

  return {
    verdict: validated.verdict,
    reasoning: validated.reasoning,
    concerns: validated.concerns,
    model: response.model,
    cost: response.cost,
    content_truncated: truncated,
    content_chars_sent: contentForModel.length,
  };
}

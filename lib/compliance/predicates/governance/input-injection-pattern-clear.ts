// Input-injection-pattern-clear composite predicate (REAL, not stub).
// Scans the payload for known injection patterns across four categories:
// SQL, shell, path traversal, and LLM prompt injection. Pass iff no pattern
// matches. Fail details cite the category and a truncated match excerpt
// (NOT the full payload — the payload may contain attack content that
// should not be persisted verbatim in audit trails).

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type PayloadValue = string | Record<string, unknown> | unknown[];

interface InjectionInput {
  payload: PayloadValue;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['payload'],
  properties: {
    payload: {
      oneOf: [{ type: 'string' }, { type: 'object' }, { type: 'array' }],
    },
  },
  additionalProperties: false,
};

interface PatternEntry {
  category: 'sql' | 'shell' | 'path' | 'prompt';
  regex: RegExp;
}

const PATTERNS: PatternEntry[] = [
  {
    category: 'sql',
    regex: /(\bDROP\s+TABLE\b|\bUNION\s+SELECT\b|\bOR\s+1\s*=\s*1\b|--\s*$|;\s*DROP\b)/i,
  },
  {
    category: 'shell',
    regex: /(\$\(|`|\|\s*sh\b|;\s*rm\s+-rf|>\s*\/dev\/null)/i,
  },
  {
    category: 'path',
    regex: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
  },
  {
    category: 'prompt',
    regex: /(ignore\s+previous\s+instructions|ignore\s+all\s+prior|system\s*:|<\|im_start\||<\|im_end\||\\nuser:|\\nassistant:)/i,
  },
];

const MATCH_EXCERPT_MAX = 64;

const PREDICATE_NAME = 'input_injection_pattern_clear';

function stringifyPayload(payload: PayloadValue): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

function truncate(s: string): string {
  if (s.length <= MATCH_EXCERPT_MAX) return s;
  return `${s.slice(0, MATCH_EXCERPT_MAX)}…`;
}

export const inputInjectionPatternClearPredicate: CompositePredicate<InjectionInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const text = stringifyPayload(input.payload);

    for (const { category, regex } of PATTERNS) {
      const m = text.match(regex);
      if (m) {
        return {
          predicate: PREDICATE_NAME,
          result: 'fail',
          reason: `injection pattern matched (category: ${category})`,
          details: {
            category,
            match_excerpt: truncate(m[0]),
            payload_length: text.length,
          },
        };
      }
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: 'no injection patterns matched',
      details: {
        payload_length: text.length,
        categories_checked: PATTERNS.map((p) => p.category),
      },
    };
  },
};

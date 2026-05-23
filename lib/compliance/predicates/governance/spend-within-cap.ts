// Spend-within-cap composite predicate (REAL, not stub).
// General-case spend governance: projected spend (any currency unit) must
// stay below an effective monthly ceiling, where the ceiling is the
// monthly_cap_usd reduced by a safety margin (defaults to 10%). Generalizes
// scrape_budget_within_monthly_cap, which remains the BD-specific stub.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SpendWithinCapInput {
  projected_spend_usd: number;
  monthly_cap_usd: number;
  safety_margin_pct?: number;
}

const DEFAULT_SAFETY_MARGIN_PCT = 10;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['projected_spend_usd', 'monthly_cap_usd'],
  properties: {
    projected_spend_usd: { type: 'number', minimum: 0 },
    monthly_cap_usd: { type: 'number', minimum: 0 },
    safety_margin_pct: { type: 'number', minimum: 0, maximum: 100 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'spend_within_cap';

export const spendWithinCapPredicate: CompositePredicate<SpendWithinCapInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const margin = input.safety_margin_pct ?? DEFAULT_SAFETY_MARGIN_PCT;
    const effectiveCeiling = input.monthly_cap_usd * (1 - margin / 100);

    if (input.projected_spend_usd > effectiveCeiling) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `projected spend $${input.projected_spend_usd} exceeds effective ceiling $${effectiveCeiling.toFixed(2)} (cap $${input.monthly_cap_usd} - ${margin}% margin)`,
        details: {
          projected_spend_usd: input.projected_spend_usd,
          monthly_cap_usd: input.monthly_cap_usd,
          safety_margin_pct: margin,
          effective_ceiling_usd: effectiveCeiling,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `projected spend $${input.projected_spend_usd} within ceiling $${effectiveCeiling.toFixed(2)}`,
      details: {
        projected_spend_usd: input.projected_spend_usd,
        effective_ceiling_usd: effectiveCeiling,
      },
    };
  },
};

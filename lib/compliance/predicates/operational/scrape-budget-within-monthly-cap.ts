// Operational BD scrape-budget composite predicate.
// Bright Data integration day wires real month-to-date BD spend lookup
// and confirms MTD + projected daily spend stays under the configured
// monthly cap with margin.
// Bubble 2 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface ScrapeBudgetInput {
  /** Today's projected BD spend in USD; combined with MTD vs. the cap. */
  projected_spend_usd: number;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['projected_spend_usd'],
  properties: {
    projected_spend_usd: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'scrape_budget_within_monthly_cap';

export const scrapeBudgetWithinMonthlyCapPredicate: CompositePredicate<ScrapeBudgetInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'BD scrape-budget MTD lookup not yet implemented',
      details: {
        projected_spend_usd: input.projected_spend_usd,
        would_check: 'mtd_bd_spend_plus_projected_below_monthly_cap_with_margin',
        deferred_to: 'Bright Data integration day',
      },
    };
  },
};

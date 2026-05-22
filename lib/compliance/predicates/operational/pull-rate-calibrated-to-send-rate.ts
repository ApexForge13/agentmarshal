// Operational pull-rate calibration composite predicate.
// COO pipeline controller integration wires real pull-plan lookup and
// confirms today's pull plan was derived from the formula in
// spec/v0.1/agents.md §5.3 using the rolling 7-day fallthrough rate.
// Bubble 2 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface PullRateInput {
  /** Date (YYYY-MM-DD) of the pull plan being evaluated. */
  pull_date: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['pull_date'],
  properties: {
    pull_date: { type: 'string', format: 'date' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'pull_rate_calibrated_to_send_rate';

export const pullRateCalibratedToSendRatePredicate: CompositePredicate<PullRateInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'pull-plan calibration check not yet implemented',
      details: {
        pull_date: input.pull_date,
        would_check:
          'pulls_today_equals_send_rate_target_minus_buffer_surplus_over_one_minus_fallthrough_rolling_7d',
        deferred_to: 'COO pipeline controller integration',
      },
    };
  },
};

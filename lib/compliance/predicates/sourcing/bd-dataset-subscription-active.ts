// Sourcing Bright Data dataset subscription composite predicate.
// Bright Data integration day wires real subscription + quota lookup
// against the BD subscription manager.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface BdDatasetSubscriptionInput {
  /** BD dataset identifier (e.g., "linkedin_company", "linkedin_people"). */
  dataset_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['dataset_id'],
  properties: {
    dataset_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_dataset_subscription_active';

export const bdDatasetSubscriptionActivePredicate: CompositePredicate<BdDatasetSubscriptionInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'BD dataset subscription + quota lookup not yet implemented',
      details: {
        dataset_id: input.dataset_id,
        would_check: 'subscription_valid_and_within_quota_at_query_time',
        deferred_to: 'Bright Data integration day (BD subscription manager)',
      },
    };
  },
};

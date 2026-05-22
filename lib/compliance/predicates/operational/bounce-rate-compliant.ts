// Operational bounce-rate composite predicate.
// InboxAllocator metrics integration wires real per-inbox 7-day rolling
// bounce-rate lookup and compares to the warmup-tier-specific threshold.
// Bubble 2 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface BounceRateInput {
  /** Sender (inbox) identifier whose bounce rate should be evaluated. */
  sender_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['sender_id'],
  properties: {
    sender_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'bounce_rate_compliant';

export const bounceRateCompliantPredicate: CompositePredicate<BounceRateInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'per-inbox bounce-rate lookup not yet implemented',
      details: {
        sender_id: input.sender_id,
        would_check: 'rolling_7d_bounce_rate_within_warmup_tier_threshold',
        deferred_to: 'InboxAllocator metrics integration',
      },
    };
  },
};

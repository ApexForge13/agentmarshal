// Operational sender-reputation composite predicate.
// InboxAllocator metrics integration wires real reputation-score lookup
// per sender (against ESP feedback loops and reputation tables) and
// compares to the operational threshold for the sender's warmup tier.
// Bubble 2 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SenderReputationInput {
  /** Sender (inbox) identifier whose reputation should be evaluated. */
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

const PREDICATE_NAME = 'sender_reputation_above_threshold';

export const senderReputationAboveThresholdPredicate: CompositePredicate<SenderReputationInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'sender reputation lookup not yet implemented',
      details: {
        sender_id: input.sender_id,
        would_check: 'sender_reputation_score_above_threshold_for_warmup_tier_at_send_time',
        deferred_to: 'InboxAllocator metrics integration',
      },
    };
  },
};

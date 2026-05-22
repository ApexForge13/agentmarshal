// Operational aggregate send-capacity composite predicate.
// InboxAllocator metrics integration wires real aggregate capacity lookup
// across the 105-domain pool (warmed senders × per-inbox cap) and confirms
// the total exceeds today's target send rate plus reserve.
// Bubble 2 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface InboxSendCapacityInput {
  /** Target send count for the day; capacity must exceed this plus a reserve. */
  target_send_count: number;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['target_send_count'],
  properties: {
    target_send_count: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'inbox_send_capacity_above_floor';

export const inboxSendCapacityAboveFloorPredicate: CompositePredicate<InboxSendCapacityInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'aggregate inbox capacity lookup not yet implemented',
      details: {
        target_send_count: input.target_send_count,
        would_check: 'sum_warmed_sender_capacity_minus_reserve_above_target_send_count',
        deferred_to: 'InboxAllocator metrics integration',
      },
    };
  },
};

// CAN-SPAM unsubscribe mechanism (liveness) composite predicate.
// 15 USC §7704(a)(4): the unsubscribe mechanism must remain operational for at least
// 30 days after sending. Real liveness probing lands Day 6 (echo-os integration).

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface UnsubscribeMechanismInput {
  unsubscribe_url: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['unsubscribe_url'],
  properties: {
    unsubscribe_url: { type: 'string', format: 'uri' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_unsubscribe_mechanism_working';

export const unsubscribeMechanismPredicate: CompositePredicate<UnsubscribeMechanismInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'unsubscribe endpoint liveness check not yet implemented',
      details: {
        unsubscribe_url: input.unsubscribe_url,
        would_check: 'endpoint_responds_200_for_30_days',
        deferred_to: 'Day 6 (echo-os integration)',
      },
    };
  },
};

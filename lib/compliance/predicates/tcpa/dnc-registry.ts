// TCPA DNC (Do-Not-Call) registry composite predicate.
// Day 6 wires real Bright Data Web Unlocker lookup against donotcall.gov.
// Bubble 1a: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface DncRegistryInput {
  /** Recipient phone in E.164 (e.g., "+14045551234"). */
  recipient_phone: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['recipient_phone'],
  properties: {
    recipient_phone: { type: 'string', pattern: '^\\+[1-9][0-9]{1,14}$' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'tcpa_dnc_registry_check';

export const dncRegistryPredicate: CompositePredicate<DncRegistryInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason:
        'DNC registry lookup not yet implemented; real Bright Data Web Unlocker lookup lands Day 6',
      details: {
        recipient_phone: input.recipient_phone,
        would_check: `https://www.donotcall.gov registry for ${input.recipient_phone}`,
        deferred_to: 'Day 6 (Bright Data Web Unlocker)',
      },
    };
  },
};

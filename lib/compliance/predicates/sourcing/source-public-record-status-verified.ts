// Sourcing public-record verification composite predicate.
// Bright Data integration day wires real public-record authority registry
// (state SoS index, regulatory licensing boards) to confirm a source's
// public-record claim is corroborated by a non-self-reported authority.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SourcePublicRecordInput {
  /** Identifier of the source claiming public-record status. */
  source_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['source_id'],
  properties: {
    source_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'source_public_record_status_verified';

export const sourcePublicRecordStatusVerifiedPredicate: CompositePredicate<SourcePublicRecordInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: 'public-record authority registry not yet implemented',
        details: {
          source_id: input.source_id,
          would_check: 'public_record_claim_confirmed_against_non_self_reported_authority',
          deferred_to: 'Bright Data integration day (public-record authority registry)',
        },
      };
    },
  };

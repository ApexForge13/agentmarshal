// Sourcing source-attribution retention composite predicate.
// Bright Data integration day wires real attribution-retention check
// against the lead store; verifies source URL + timestamp + provenance
// survive downstream merges and normalizations for the field's lifetime.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SourceAttributionInput {
  /** Lead store row identifier. */
  lead_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['lead_id'],
  properties: {
    lead_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'source_attribution_retained';

export const sourceAttributionRetainedPredicate: CompositePredicate<SourceAttributionInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'source-attribution retention check not yet implemented',
      details: {
        lead_id: input.lead_id,
        would_check: 'source_url_timestamp_and_provenance_retained_for_field_lifetime',
        deferred_to: 'Bright Data integration day (LeadScraper provenance pipeline)',
      },
    };
  },
};

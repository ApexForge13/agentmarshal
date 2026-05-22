// Sourcing data-source provenance composite predicate.
// Bright Data integration day wires real LeadScraper provenance lookup
// against the lead store's per-field source attribution.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface DataSourceProvenanceInput {
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

const PREDICATE_NAME = 'data_source_provenance_recorded';

export const dataSourceProvenanceRecordedPredicate: CompositePredicate<DataSourceProvenanceInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'per-field provenance check not yet implemented',
      details: {
        lead_id: input.lead_id,
        would_check: 'every_field_has_bd_job_id_or_public_api_call_id_or_scrape_source_url_plus_timestamp',
        deferred_to: 'Bright Data integration day (LeadScraper provenance pipeline)',
      },
    };
  },
};

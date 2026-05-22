// Sourcing ToS-compliance composite predicate.
// Bright Data integration day wires real source-classification table
// to confirm the acquisition method matches the source's ToS regime.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type AcquisitionMethod = 'bd_licensed' | 'public_api' | 'direct_scrape';

interface DataAcquisitionTosInput {
  source_url: string;
  acquisition_method: AcquisitionMethod;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['source_url', 'acquisition_method'],
  properties: {
    source_url: { type: 'string', format: 'uri' },
    acquisition_method: {
      type: 'string',
      enum: ['bd_licensed', 'public_api', 'direct_scrape'],
    },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'data_acquisition_tos_compliant';

export const dataAcquisitionTosCompliantPredicate: CompositePredicate<DataAcquisitionTosInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'source-classification table not yet implemented',
      details: {
        source_url: input.source_url,
        acquisition_method: input.acquisition_method,
        would_check: 'source_is_bd_licensed_or_public_api_or_robots_txt_honored_direct_scrape',
        deferred_to: 'Bright Data integration day (source classification table)',
      },
    };
  },
};

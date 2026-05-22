// Sourcing PII field-handling composite predicate.
// Bright Data integration day wires real PII policy registry
// to confirm retention + minimization rules are recorded for each PII field.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface PiiFieldHandlingInput {
  /** Name of the PII field (e.g., "email", "phone", "linkedin_url"). */
  field_name: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['field_name'],
  properties: {
    field_name: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'pii_field_handling_documented';

export const piiFieldHandlingDocumentedPredicate: CompositePredicate<PiiFieldHandlingInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'PII field handling registry not yet implemented',
      details: {
        field_name: input.field_name,
        would_check: 'retention_and_minimization_rules_recorded_for_pii_field',
        deferred_to: 'Bright Data integration day (PII policy registry)',
      },
    };
  },
};

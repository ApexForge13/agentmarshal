// TCPA consent composite predicate.
// Verifies consent record presence and level for the call type.
// Sales calls require written_express consent (47 CFR 64.1200(a)(2)).
// Informational calls accept informal consent.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type CallType = 'sales' | 'informational';
type ConsentLevel = 'written_express' | 'informal' | 'none';

interface ConsentInput {
  consent_record_id?: string;
  consent_level?: ConsentLevel;
  call_type: CallType;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['call_type'],
  properties: {
    consent_record_id: { type: 'string', minLength: 1 },
    consent_level: { type: 'string', enum: ['written_express', 'informal', 'none'] },
    call_type: { type: 'string', enum: ['sales', 'informational'] },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'tcpa_consent_present';

export const consentPredicate: CompositePredicate<ConsentInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (!input.consent_record_id) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'no consent_record_id provided',
        details: { call_type: input.call_type },
      };
    }

    const level: ConsentLevel = input.consent_level ?? 'none';

    if (input.call_type === 'sales' && level !== 'written_express') {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `sales calls require written_express consent; actual: ${level}`,
        details: {
          call_type: input.call_type,
          required_level: 'written_express',
          actual_level: level,
          consent_record_id: input.consent_record_id,
        },
      };
    }

    if (input.call_type === 'informational' && level === 'none') {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'informational calls require at least informal consent',
        details: {
          call_type: input.call_type,
          actual_level: level,
          consent_record_id: input.consent_record_id,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `consent level ${level} is sufficient for ${input.call_type} call`,
      details: {
        call_type: input.call_type,
        actual_level: level,
        consent_record_id: input.consent_record_id,
      },
    };
  },
};

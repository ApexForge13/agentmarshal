// TCPA caller-ID composite predicate.
// 47 CFR 64.1200(b)(1): caller identification required.
// Passes when caller_phone (E.164) or caller_display_name is present.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface CallerIdInput {
  caller_phone?: string;
  caller_display_name?: string;
}

const E164_PATTERN = /^\+[1-9][0-9]{1,14}$/;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    caller_phone: { type: 'string' },
    caller_display_name: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'tcpa_caller_id_check';

export const callerIdPredicate: CompositePredicate<CallerIdInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const hasPhone =
      typeof input.caller_phone === 'string' && E164_PATTERN.test(input.caller_phone);
    const hasName =
      typeof input.caller_display_name === 'string' && input.caller_display_name.length > 0;

    if (input.caller_phone !== undefined && !hasPhone) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'caller_phone provided but not in E.164 format',
        details: { caller_phone: input.caller_phone },
      };
    }

    if (!hasPhone && !hasName) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason:
          'caller identification required: provide caller_phone (E.164) or caller_display_name',
        details: {
          caller_phone: input.caller_phone,
          caller_display_name: input.caller_display_name,
        },
      };
    }

    const reason =
      hasPhone && hasName
        ? 'caller ID includes both phone and display name'
        : hasPhone
          ? 'caller ID includes phone'
          : 'caller ID includes display name';

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason,
      details: {
        has_phone: hasPhone,
        has_display_name: hasName,
        caller_phone: input.caller_phone,
        caller_display_name: input.caller_display_name,
      },
    };
  },
};

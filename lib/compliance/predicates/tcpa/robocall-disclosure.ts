// TCPA robocall disclosure composite predicate.
// 47 CFR 64.1200(b)(1-3): artificial/prerecorded calls must include identification +
// opt-out disclosure. Predicate is N/A (treated as pass) for human-initiated calls.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type CallType = 'human' | 'artificial' | 'prerecorded';

interface RobocallDisclosureInput {
  call_type: CallType;
  disclosure_text?: string;
  opt_out_method?: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['call_type'],
  properties: {
    call_type: { type: 'string', enum: ['human', 'artificial', 'prerecorded'] },
    disclosure_text: { type: 'string', minLength: 1 },
    opt_out_method: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'tcpa_robocall_disclosure_check';

export const robocallDisclosurePredicate: CompositePredicate<RobocallDisclosureInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (input.call_type === 'human') {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: 'predicate not applicable: call_type is human (not artificial/prerecorded)',
        details: { call_type: input.call_type, applicable: false },
      };
    }

    const hasDisclosure =
      typeof input.disclosure_text === 'string' && input.disclosure_text.length > 0;
    const hasOptOut =
      typeof input.opt_out_method === 'string' && input.opt_out_method.length > 0;

    if (!hasDisclosure || !hasOptOut) {
      const missing: string[] = [];
      if (!hasDisclosure) missing.push('disclosure_text');
      if (!hasOptOut) missing.push('opt_out_method');
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `${input.call_type} calls require: ${missing.join(', ')}`,
        details: { call_type: input.call_type, missing },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `${input.call_type} call includes required disclosure and opt-out`,
      details: {
        call_type: input.call_type,
        disclosure_text: input.disclosure_text,
        opt_out_method: input.opt_out_method,
      },
    };
  },
};

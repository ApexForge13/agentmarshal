// Voice caller-ID accuracy runtime composite predicate.
// Runtime check: confirms the caller-ID was actually transmitted on the
// outbound leg and matches the agent's authorized caller-ID (anti-spoofing).
// Complementary to the TCPA `tcpa_caller_id_disclosed` declarative-input
// check, which validates that the caller-ID is declared and well-formed
// in the Scope Contract at policy-issuance time. Both must pass for any
// outbound voice action.
// Voice agent integration wires real SIP / outbound-leg verification
// per 47 CFR §64.1601 and the Truth-in-Caller-ID Act.
// Bubble 3 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface VoiceCallerIdInput {
  /** Call identifier whose outbound caller-ID transmission should be verified. */
  call_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['call_id'],
  properties: {
    call_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'voice_caller_id_accurate';

export const voiceCallerIdAccuratePredicate: CompositePredicate<VoiceCallerIdInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'outbound caller-ID transmission verification not yet implemented',
      details: {
        call_id: input.call_id,
        would_check:
          'transmitted_caller_id_matches_authorized_caller_id_per_47_cfr_64_1601_and_truth_in_caller_id_act',
        deferred_to: 'Voice agent integration',
      },
    };
  },
};

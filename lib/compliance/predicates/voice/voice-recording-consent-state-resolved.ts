// Voice recording-consent state composite predicate.
// Voice agent integration wires real per-state consent-regime lookup
// (one-party vs two-party) and confirms that for two-party states (TX,
// FL, CA, IL, MD, MA, MT, NH, PA, WA, etc.) explicit recording-consent
// disclosure was logged + acknowledged before the recording began.
// Bubble 3 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface VoiceRecordingConsentInput {
  /** Caller's resolved US state code (e.g., "TX", "CA"); two-letter ANSI. */
  caller_state: string;
  /** Call identifier used to look up the consent-acknowledgement event. */
  call_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['caller_state', 'call_id'],
  properties: {
    caller_state: { type: 'string', pattern: '^[A-Z]{2}$' },
    call_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'voice_recording_consent_state_resolved';

export const voiceRecordingConsentStateResolvedPredicate: CompositePredicate<VoiceRecordingConsentInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: 'per-state consent-regime lookup not yet implemented',
        details: {
          caller_state: input.caller_state,
          call_id: input.call_id,
          would_check:
            'state_consent_regime_resolved_and_for_two_party_states_disclosure_logged_and_acknowledged_pre_recording',
          deferred_to: 'Voice agent integration',
        },
      };
    },
  };

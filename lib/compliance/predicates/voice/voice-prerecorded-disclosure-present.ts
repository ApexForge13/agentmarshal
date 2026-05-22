// Voice prerecorded-disclosure runtime composite predicate.
// Runtime check: confirms the prerecorded disclosure was actually played
// on the call (transcript / segment-event verification). Complementary
// to the TCPA `tcpa_robocall_disclosure_present` declarative-input check,
// which validates the disclosure metadata is declared in the Scope
// Contract at policy-issuance time. Both must pass for hybrid voice
// segments that include any prerecorded audio.
// Voice agent integration wires real transcript / segment-event lookup.
// Bubble 3 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface VoicePrerecordedDisclosureInput {
  /** Call identifier whose transcript / segment events should be verified. */
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

const PREDICATE_NAME = 'voice_prerecorded_disclosure_present';

export const voicePrerecordedDisclosurePresentPredicate: CompositePredicate<VoicePrerecordedDisclosureInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: 'transcript / segment-event verification not yet implemented',
        details: {
          call_id: input.call_id,
          would_check:
            'prerecorded_disclosure_audio_actually_played_and_audible_at_segment_start',
          deferred_to: 'Voice agent integration',
        },
      };
    },
  };

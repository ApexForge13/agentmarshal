// Voice abandonment-rate composite predicate.
// Voice agent integration wires real 30-day rolling abandonment-rate
// lookup per voice agent (calls connected to a live person but the
// agent failed to engage within 2 seconds) and confirms the rate stays
// below the TCPA 3% threshold per 47 CFR §64.1200(a)(7).
// Bubble 3 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface VoiceAbandonmentRateInput {
  /** Voice agent identifier whose abandonment rate should be evaluated. */
  voice_agent_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['voice_agent_id'],
  properties: {
    voice_agent_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'voice_abandonment_rate_compliant';

export const voiceAbandonmentRateCompliantPredicate: CompositePredicate<VoiceAbandonmentRateInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: 'voice abandonment-rate lookup not yet implemented',
        details: {
          voice_agent_id: input.voice_agent_id,
          would_check: 'rolling_30d_abandonment_rate_below_tcpa_3pct_threshold_47_cfr_64_1200_a_7',
          deferred_to: 'Voice agent integration',
        },
      };
    },
  };

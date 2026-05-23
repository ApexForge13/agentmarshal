// Voice recording-consent state composite predicate (REAL as of Bubble 9).
//
// Gates the `record_call` action against the caller's live consent state.
// The Scope Contract's static composite_checks[].input carries issuance-time
// parameters (caller_state, call_id); the *runtime* consent status is supplied
// by the Voice agent through the AuthZEN request's action.properties and read
// here via ctx.action_properties (see lib/authzen/eval-context.ts). This keeps
// the production path off setContractOverride — the contract is unchanged and
// the live state rides the request.
//
// v0.2 hackathon policy (deliberately permissive on unknown; tighten before
// any two-party-state production traffic):
//   - revoked            → FAIL  (caller withdrew consent; recording must stop)
//   - granted            → PASS
//   - unknown / absent   → PASS  (treated as one-party-default consent; see note)
//
// Future production logic (deferred to the echo-os Voice agent integration):
// resolve the per-state consent regime (one-party vs two-party — TX, FL, CA,
// IL, MD, MA, MT, NH, PA, WA, etc.) and, for two-party states, require an
// explicit recording-consent disclosure logged + acknowledged before the
// recording began. Until then `unknown` must NOT be treated as consent in
// two-party states.

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

type ConsentStatus = 'unknown' | 'granted' | 'revoked';

function readConsentStatus(props: Record<string, unknown> | undefined): ConsentStatus {
  const raw = props?.['consent_status'];
  if (raw === 'granted' || raw === 'revoked' || raw === 'unknown') return raw;
  return 'unknown';
}

export const voiceRecordingConsentStateResolvedPredicate: CompositePredicate<VoiceRecordingConsentInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, ctx): Promise<CompositePredicateEvaluation> {
      const consent = readConsentStatus(ctx.action_properties);
      // Prefer live request-time identifiers over the contract's issuance-time
      // placeholders so the receipt cites the actual call. Fall back to input
      // (which the schema guarantees is present) when not supplied at runtime.
      const callId =
        typeof ctx.action_properties?.['call_id'] === 'string'
          ? (ctx.action_properties['call_id'] as string)
          : input.call_id;
      const callerState =
        typeof ctx.action_properties?.['caller_state'] === 'string'
          ? (ctx.action_properties['caller_state'] as string)
          : input.caller_state;

      if (consent === 'revoked') {
        return {
          predicate: PREDICATE_NAME,
          result: 'fail',
          reason: `recording consent revoked by caller for call ${callId} (state ${callerState}); record_call must not proceed`,
          details: {
            caller_state: callerState,
            call_id: callId,
            consent_status: consent,
            reasons: [
              'caller explicitly revoked recording consent mid-call',
              'fail-safe consent policy blocks any further record_call',
            ],
          },
        };
      }

      const isUnknownTreatedAsConsent = consent === 'unknown';
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason:
          consent === 'granted'
            ? `recording consent granted by caller for call ${callId}`
            : `recording consent unknown for call ${callId}; v0.2 treats unknown as one-party-default consent (tighten for two-party states in production)`,
        details: {
          caller_state: callerState,
          call_id: callId,
          consent_status: consent,
          unknown_treated_as_consent: isUnknownTreatedAsConsent,
          reasons: isUnknownTreatedAsConsent
            ? [
                'consent_status unknown; v0.2 hackathon policy treats unknown as one-party-default consent',
                'PRODUCTION NOTE: resolve per-state consent regime and require explicit disclosure in two-party states',
              ]
            : ['caller granted recording consent'],
        },
      };
    },
  };

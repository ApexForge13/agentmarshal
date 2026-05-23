// Voice agent core types (Bubble 9).
//
// SAMPLE AGENT — see lib/voice/README.md. Production architecture has the
// Voice agent in echo-os (a separate codebase); this lives in the agentmarshal
// repo as a hackathon concession to demonstrate mid-call Marshal integration.

/** Live recording-consent state for a call. Mutable across the call lifetime. */
export type ConsentStatus = 'unknown' | 'granted' | 'revoked';

/**
 * Conversation phase driving which scripted utterance bank is used.
 * Scope is intentionally narrow (triage + escalation): greet, capture basic
 * info, recover after a consent denial, confirm a callback, escalate to a human.
 * No qualification logic, no appointment booking, no calendar integration.
 */
export type CallPhase =
  | 'greeting'
  | 'capturing'
  | 'recovery_after_deny'
  | 'callback_confirmation'
  | 'close';

/** A single turn of dialogue, append-only on CallState.transcript. */
export interface ConversationTurn {
  role: 'caller' | 'agent';
  text: string;
  at: string; // ISO8601
}

/** Detected state transition from a caller utterance (or null if none). */
export type StateTransitionType =
  | 'consent_revoked'
  | 'consent_granted'
  | 'caller_ending';

export interface StateTransition {
  type: StateTransitionType;
  /** The keyword/phrase that matched, for audit + debugging. */
  matched: string;
  /** The full caller utterance the transition was detected in. */
  utterance: string;
}

/** In-memory per-call state. Keyed by call_id in the call-state store. */
export interface CallState {
  call_id: string;
  agent_id: 'voice-001';
  started_at: string; // ISO8601
  caller_phone?: string; // from Vapi event
  caller_state?: string; // US state, optional, deferred BD lookup
  recording_active: boolean; // mutable
  consent_status: ConsentStatus; // mutable
  transcript: ConversationTurn[]; // append-only
  scheduled_actions: string[]; // actions to attempt next turn (e.g. ['record_call'])
  receipts_emitted: string[]; // signed receipt IDs from Marshal evals
  /**
   * Current conversation phase. Not part of the spec's minimal CallState shape;
   * added so conversation-flow can select the right utterance bank without
   * re-deriving phase from the transcript on every turn.
   */
  phase: CallPhase;
}

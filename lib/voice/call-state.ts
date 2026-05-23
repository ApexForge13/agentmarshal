// In-memory call-state store (Bubble 9).
//
// SAMPLE AGENT — demo-grade. A Map<callId, CallState> with no TTL/eviction; a
// process restart drops all state. Production (echo-os) would back this with a
// durable store keyed by the Vapi call id. Fine for a single demo call.

import type { CallState, ConversationTurn, StateTransition } from './types';

const STORE = new Map<string, CallState>();

export const VOICE_AGENT_ID = 'voice-001' as const;

/** Reset the store. Test-only helper. */
export function clearCallStates(): void {
  STORE.clear();
}

export function getCallState(callId: string): CallState | undefined {
  return STORE.get(callId);
}

/**
 * Get the existing CallState for a call, or create + store a fresh one. A new
 * call starts with recording active and consent unknown (one-party default;
 * see voice_recording_consent_state_resolved for the v0.2 policy note).
 */
export function getOrCreateCallState(
  callId: string,
  init: { caller_phone?: string; caller_state?: string; startedAt?: string } = {},
): CallState {
  const existing = STORE.get(callId);
  if (existing) return existing;

  const state: CallState = {
    call_id: callId,
    agent_id: VOICE_AGENT_ID,
    started_at: init.startedAt ?? new Date().toISOString(),
    caller_phone: init.caller_phone,
    caller_state: init.caller_state,
    recording_active: true,
    consent_status: 'unknown',
    transcript: [],
    scheduled_actions: [],
    receipts_emitted: [],
    phase: 'greeting',
  };
  STORE.set(callId, state);
  return state;
}

export function appendTurn(state: CallState, turn: ConversationTurn): void {
  state.transcript.push(turn);
}

export function queueAction(state: CallState, action: string): void {
  if (!state.scheduled_actions.includes(action)) {
    state.scheduled_actions.push(action);
  }
}

/** Remove and return all queued actions in FIFO order. */
export function drainScheduledActions(state: CallState): string[] {
  const drained = state.scheduled_actions;
  state.scheduled_actions = [];
  return drained;
}

export function recordReceipt(state: CallState, receiptId: string): void {
  if (receiptId && !state.receipts_emitted.includes(receiptId)) {
    state.receipts_emitted.push(receiptId);
  }
}

/**
 * Apply a detected state transition to the call. Mutates consent_status and
 * recording_active, and queues a continued record_call attempt on revocation
 * so the next turn surfaces it to Marshal (the agent "tries" to keep recording
 * and gets caught). Returns the (possibly unchanged) state.
 */
export function applyTransition(state: CallState, transition: StateTransition): CallState {
  switch (transition.type) {
    case 'consent_revoked':
      state.consent_status = 'revoked';
      // Tentatively stop recording immediately; the queued record_call attempt
      // is what Marshal evaluates and denies, producing the Compliance Receipt.
      state.recording_active = false;
      queueAction(state, 'record_call');
      break;
    case 'consent_granted':
      state.consent_status = 'granted';
      state.recording_active = true;
      break;
    case 'caller_ending':
      state.phase = 'close';
      break;
  }
  return state;
}

// POST /api/voice/vapi/webhook — Vapi custom-LLM webhook receiver (Bubble 9).
//
// SAMPLE AGENT — production architecture has the Voice agent in echo-os (a
// separate codebase). This lives in the agentmarshal repo as a hackathon
// concession to demonstrate mid-call Marshal integration end-to-end. See
// lib/voice/README.md.
//
// Stack (configured Vapi-side, independent of this code):
//   - Vapi sandbox phone number → posts here on each turn
//   - ElevenLabs TTS via Vapi voice settings
//   - OpenAI Whisper transcription via Vapi transcriber settings
//   - Custom LLM = this webhook: we return the next assistant utterance
//
// Marshal is evaluated on STATE TRANSITIONS, not every utterance. The arc:
// caller revokes recording consent → applyTransition flips consent_status to
// 'revoked' and queues a continued record_call attempt → that attempt is
// evaluated in-process against the Voice agent's Scope Contract → the upgraded
// voice_recording_consent_state_resolved composite returns fail → deny + signed
// Compliance Receipt → conversation-flow returns the recovery utterance.

import { NextResponse } from 'next/server';
import {
  getOrCreateCallState,
  appendTurn,
  applyTransition,
  drainScheduledActions,
  recordReceipt,
  queueAction,
} from '@/lib/voice/call-state';
import { detectTransition } from '@/lib/voice/transition-detector';
import { nextUtterance, recoveryUtterance } from '@/lib/voice/conversation-flow';
import { evaluateAction } from '@/lib/voice/marshal-integration';
import { parseVapiWebhook, toVapiResponse } from '@/lib/voice/vapi-adapter';
import type { CallPhase, CallState } from '@/lib/voice/types';

export const runtime = 'nodejs';

// Normal (no transition / no deny) phase progression. Transitions and denials
// override this: a denied record_call → recovery_after_deny; caller_ending → close.
const NEXT_PHASE: Record<CallPhase, CallPhase> = {
  greeting: 'capturing',
  capturing: 'capturing', // demo collects a few basic fields before a transition pivots the call
  recovery_after_deny: 'callback_confirmation',
  callback_confirmation: 'close',
  close: 'close',
};

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const event = parseVapiWebhook(payload as Record<string, unknown>);

  // Call start (or anything before the first caller utterance): greet.
  if (event.type === 'call_start') {
    const state = getOrCreateCallState(event.call_id, { caller_phone: event.caller_phone });
    const greeting = nextUtterance(state); // phase 'greeting'
    appendTurn(state, { role: 'agent', text: greeting.text, at: new Date().toISOString() });
    return NextResponse.json(buildResponse(state, greeting.text, false));
  }

  // Non-speech events (status updates, partials, assistant echoes): ack, no reply.
  if (event.type !== 'caller_utterance') {
    return NextResponse.json({ ok: true, ignored: event.raw_type });
  }

  const state = getOrCreateCallState(event.call_id, { caller_phone: event.caller_phone });
  const utterance = event.utterance ?? '';
  appendTurn(state, { role: 'caller', text: utterance, at: new Date().toISOString() });

  // 1. Detect + apply any state transition.
  const transition = detectTransition(utterance);
  if (transition) {
    applyTransition(state, transition);
  }

  // 2. Run Marshal on each scheduled action (transition-triggered).
  let recordCallDenied = false;
  for (const action of drainScheduledActions(state)) {
    const decision = await evaluateAction(state, action);
    if (decision.receipt_id) recordReceipt(state, decision.receipt_id);
    if (!decision.allowed) {
      if (action === 'record_call') {
        recordCallDenied = true;
        state.recording_active = false; // enforce the deny
      }
    }
  }

  // 3. Resolve the phase for this turn.
  if (recordCallDenied) {
    state.phase = 'recovery_after_deny';
  } else if (transition?.type === 'caller_ending') {
    state.phase = 'close';
  } else {
    state.phase = NEXT_PHASE[state.phase];
  }

  // 4. Select the next agent utterance.
  const selection = recordCallDenied ? recoveryUtterance(state) : nextUtterance(state);
  for (const a of selection.queue_actions) queueAction(state, a);
  appendTurn(state, { role: 'agent', text: selection.text, at: new Date().toISOString() });

  return NextResponse.json(buildResponse(state, selection.text, selection.end_call));
}

function buildResponse(
  state: CallState,
  utterance: string,
  endCall: boolean,
): Record<string, unknown> {
  return toVapiResponse({
    utterance,
    end_call: endCall,
    agentmarshal: {
      call_id: state.call_id,
      phase: state.phase,
      consent_status: state.consent_status,
      recording_active: state.recording_active,
      receipts_emitted: state.receipts_emitted,
      scheduled_actions: state.scheduled_actions,
    },
  });
}

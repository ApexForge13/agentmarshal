// Vapi webhook payload <-> internal event/response adapter (Bubble 9).
//
// SAMPLE AGENT. Vapi posts a server-message envelope on each turn; we map the
// relevant ones to internal VoiceEvents and map our reply back to a
// custom-LLM-shaped response. Real Vapi message wiring (tool/end-call control,
// streaming) is finalized Conner-side when the sandbox number is provisioned;
// the response shape here is documented demo-grade, not the full Vapi contract.
//
// Reference (subject to Conner's Vapi assistant config):
//   transcript message: { message: { type: 'transcript', role: 'user',
//     transcriptType: 'final', transcript: '...', call: { id, customer: { number } } } }

export type VoiceEventType = 'caller_utterance' | 'call_start' | 'status' | 'other';

export interface VoiceEvent {
  type: VoiceEventType;
  call_id: string;
  caller_phone?: string;
  /** Present for caller_utterance: the finalized caller transcript text. */
  utterance?: string;
  /** Raw Vapi message type, retained for debugging/audit. */
  raw_type: string;
}

interface VapiCall {
  id?: string;
  customer?: { number?: string };
}

interface VapiMessage {
  type?: string;
  role?: string;
  transcriptType?: string;
  transcript?: string;
  status?: string;
  call?: VapiCall;
}

interface VapiWebhookPayload {
  message?: VapiMessage;
  // Some Vapi configs place call at the top level too.
  call?: VapiCall;
}

function resolveCall(payload: VapiWebhookPayload): VapiCall {
  return payload.message?.call ?? payload.call ?? {};
}

/**
 * Map a Vapi webhook payload to an internal VoiceEvent. Only finalized caller
 * transcripts produce `caller_utterance`; partials and assistant turns are
 * surfaced as `other` so the handler can ignore them (we act on final caller
 * speech only — that's where transitions are detected).
 */
export function parseVapiWebhook(payload: VapiWebhookPayload): VoiceEvent {
  const msg = payload.message ?? {};
  const call = resolveCall(payload);
  const call_id = call.id ?? 'unknown-call';
  const caller_phone = call.customer?.number;
  const raw_type = msg.type ?? 'unknown';

  const isCallerRole = msg.role === 'user' || msg.role === 'customer';
  if (msg.type === 'transcript' && isCallerRole && msg.transcriptType === 'final') {
    return {
      type: 'caller_utterance',
      call_id,
      caller_phone,
      utterance: msg.transcript ?? '',
      raw_type,
    };
  }

  if (msg.type === 'assistant-request' || msg.type === 'call.started') {
    return { type: 'call_start', call_id, caller_phone, raw_type };
  }

  if (msg.type === 'status-update') {
    return { type: 'status', call_id, caller_phone, raw_type };
  }

  return { type: 'other', call_id, caller_phone, raw_type };
}

export interface VapiResponseInput {
  utterance: string;
  end_call: boolean;
  /** Demo-grade Marshal/state context, namespaced so Vapi ignores it. */
  agentmarshal: Record<string, unknown>;
}

/**
 * Build the custom-LLM-shaped reply Vapi consumes as the next assistant turn.
 * The OpenAI chat-completion envelope is what a Vapi "custom LLM" expects; the
 * `agentmarshal` block is a non-standard extension carrying our state for the
 * demo UI / tests (Vapi ignores unknown top-level keys).
 */
export function toVapiResponse(input: VapiResponseInput): Record<string, unknown> {
  return {
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: input.utterance },
        finish_reason: input.end_call ? 'stop' : 'stop',
      },
    ],
    agentmarshal: { ...input.agentmarshal, end_call: input.end_call },
  };
}

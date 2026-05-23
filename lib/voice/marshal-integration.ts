// Mid-call Marshal evaluation helper (Bubble 9).
//
// SAMPLE AGENT. Calls the real /api/access/v1/evaluation POST handler
// in-process (same pattern as the Track C benchmark evaluator) — NO network,
// NO setContractOverride (that escape hatch is test/benchmark-only). The live
// call state rides the AuthZEN request's action.properties; the upgraded
// voice_recording_consent_state_resolved composite reads consent_status from
// there via EvalContext.action_properties.
//
// Marshal is evaluated on state transitions, not on every utterance.

import { POST } from '@/app/api/access/v1/evaluation/route';
import type { CallState } from './types';

export interface MarshalDecision {
  allowed: boolean;
  /** Compliance Receipt id (Voice subject type → compliance_receipt emission). */
  receipt_id: string | null;
  reason: string;
  reason_code: string;
}

function buildRequest(state: CallState, actionName: string): unknown {
  return {
    subject: { type: 'Voice', id: state.agent_id },
    action: {
      name: actionName,
      properties: {
        call_id: state.call_id,
        caller_state: state.caller_state ?? 'TX',
        consent_status: state.consent_status,
        recording_active: state.recording_active,
      },
    },
    resource: { type: 'phone_call', id: state.call_id },
    context: { caller_phone: state.caller_phone },
  };
}

function makeHttpRequest(body: unknown): Request {
  return new Request('http://localhost/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Evaluate a single agent action against the agent's Scope Contract via the
 * real PDP. Returns the decision plus the signed Compliance Receipt id so the
 * caller can record it on the CallState.
 */
export async function evaluateAction(
  state: CallState,
  actionName: string,
): Promise<MarshalDecision> {
  const response = await POST(makeHttpRequest(buildRequest(state, actionName)));
  const body = (await response.json()) as Record<string, unknown>;

  const allowed = body.decision === true;
  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const record = (body.record ?? {}) as Record<string, unknown>;
  const receiptId = typeof record.receipt_id === 'string' ? record.receipt_id : null;

  return {
    allowed,
    receipt_id: receiptId,
    reason: typeof ctx.reason === 'string' ? ctx.reason : '',
    reason_code: typeof ctx.reason_code === 'string' ? ctx.reason_code : '',
  };
}

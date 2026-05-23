import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the PDP route so this suite tests marshal-integration's request shaping
// and decision handling in isolation (the full real-route path is exercised in
// vapi-webhook.test.ts).
vi.mock('@/app/api/access/v1/evaluation/route', () => ({
  POST: vi.fn(),
}));

import { POST } from '@/app/api/access/v1/evaluation/route';
import { evaluateAction } from '../../lib/voice/marshal-integration';
import { clearCallStates, getOrCreateCallState } from '../../lib/voice/call-state';
import type { CallState } from '../../lib/voice/types';

const mockedPOST = vi.mocked(POST);

function makeState(overrides: Partial<CallState> = {}): CallState {
  const s = getOrCreateCallState('call-mi-1', { caller_phone: '+15125550100' });
  s.caller_state = 'TX';
  return Object.assign(s, overrides);
}

let capturedBody: Record<string, unknown> | null;

function mockDecision(decision: boolean, record: Record<string, unknown>, reason = 'r') {
  const impl = async (req: Request) => {
    capturedBody = (await req.json()) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ decision, context: { reason, reason_code: 'RC' }, record }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  mockedPOST.mockImplementation(impl as unknown as typeof POST);
}

describe('voice marshal-integration', () => {
  beforeEach(() => {
    clearCallStates();
    mockedPOST.mockReset();
    capturedBody = null;
  });

  it('builds a Voice AuthZEN request carrying live call state in action.properties', async () => {
    mockDecision(true, { record_type: 'compliance_receipt', receipt_id: 'rcpt-1' });
    const state = makeState({ consent_status: 'granted', recording_active: true });

    await evaluateAction(state, 'record_call');

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.subject).toMatchObject({ type: 'Voice', id: 'voice-001' });
    const action = capturedBody!.action as Record<string, unknown>;
    expect(action.name).toBe('record_call');
    expect(action.properties).toMatchObject({
      call_id: 'call-mi-1',
      caller_state: 'TX',
      consent_status: 'granted',
      recording_active: true,
    });
    expect(capturedBody!.resource).toMatchObject({ type: 'phone_call', id: 'call-mi-1' });
  });

  it('returns allowed + receipt_id on a permit decision', async () => {
    mockDecision(true, { record_type: 'compliance_receipt', receipt_id: 'rcpt-allow' });
    const decision = await evaluateAction(makeState({ consent_status: 'granted' }), 'record_call');
    expect(decision.allowed).toBe(true);
    expect(decision.receipt_id).toBe('rcpt-allow');
  });

  it('returns denied + receipt_id on a deny decision (consent revoked)', async () => {
    mockDecision(false, { record_type: 'compliance_receipt', receipt_id: 'rcpt-deny' });
    const decision = await evaluateAction(makeState({ consent_status: 'revoked' }), 'record_call');
    expect(decision.allowed).toBe(false);
    expect(decision.receipt_id).toBe('rcpt-deny');
    const action = (capturedBody!.action as Record<string, unknown>).properties as Record<string, unknown>;
    expect(action.consent_status).toBe('revoked');
  });

  it('tolerates a response with no record (receipt_id null)', async () => {
    mockDecision(false, {});
    const decision = await evaluateAction(makeState(), 'record_call');
    expect(decision.receipt_id).toBeNull();
  });
});

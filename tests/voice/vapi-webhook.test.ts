// End-to-end webhook test (Bubble 9).
// Drives simulated Vapi payloads through the full POST handler, which calls the
// REAL /api/access/v1/evaluation route in-process (no mocks) — so this asserts
// the whole arc: transition detection → mid-call Marshal eval → deny + signed
// Compliance Receipt → recovery utterance → valid Vapi response shape.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { POST } from '../../app/api/voice/vapi/webhook/route';
import { clearCallStates, getCallState } from '../../lib/voice/call-state';
import { clearContractCache } from '../../lib/authzen/contracts';
import { init as initAudit, reset as resetAudit } from '../../lib/authzen/audit';

const CALL_ID = 'webhook-test-call-001';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/voice/vapi/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callStart() {
  return makeRequest({
    message: {
      type: 'assistant-request',
      call: { id: CALL_ID, customer: { number: '+15125550123' } },
    },
  });
}

function callerSays(text: string) {
  return makeRequest({
    message: {
      type: 'transcript',
      role: 'user',
      transcriptType: 'final',
      transcript: text,
      call: { id: CALL_ID, customer: { number: '+15125550123' } },
    },
  });
}

async function jsonOf(res: Awaited<ReturnType<typeof POST>>) {
  return (await res.json()) as Record<string, unknown>;
}

function marshalBlock(body: Record<string, unknown>): Record<string, unknown> {
  return body.agentmarshal as Record<string, unknown>;
}

function assistantContent(body: Record<string, unknown>): string {
  const choices = body.choices as Array<{ message: { content: string } }>;
  return choices[0].message.content;
}

describe('voice vapi-webhook end-to-end', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    clearCallStates();
    clearContractCache();
    tmpDbPath = path.join(os.tmpdir(), `voice-webhook-${randomUUID()}.db`);
    initAudit(tmpDbPath);
  });

  afterEach(() => {
    resetAudit();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('greets on call start with a valid custom-LLM response shape', async () => {
    const body = await jsonOf(await POST(callStart()));
    expect(assistantContent(body)).toMatch(/roof|recorded|help/i);
    expect(marshalBlock(body).phase).toBe('greeting');
    expect(marshalBlock(body).consent_status).toBe('unknown');
    expect(marshalBlock(body).recording_active).toBe(true);
  });

  it('captures basic info after the caller states intent', async () => {
    await POST(callStart());
    const body = await jsonOf(await POST(callerSays('I got your email about storm damage on my roof')));
    expect(marshalBlock(body).phase).toBe('capturing');
    // No transition → no Marshal eval yet → no receipts.
    expect(marshalBlock(body).receipts_emitted).toEqual([]);
  });

  it('fires Marshal on consent revocation, denies record_call, emits a receipt, and recovers', async () => {
    await POST(callStart());
    await POST(callerSays('I got your email about storm damage on my roof'));

    const body = await jsonOf(await POST(callerSays('hey, stop recording me')));

    // Transition detected + applied.
    const mb = marshalBlock(body);
    expect(mb.consent_status).toBe('revoked');
    // record_call denied → recording enforced off.
    expect(mb.recording_active).toBe(false);
    // Marshal eval fired → a signed Compliance Receipt id was recorded.
    expect(Array.isArray(mb.receipts_emitted)).toBe(true);
    expect((mb.receipts_emitted as string[]).length).toBeGreaterThan(0);
    expect((mb.receipts_emitted as string[])[0]).toMatch(/^[0-9a-f-]{36}$/i);
    // Conversation recovered.
    expect(mb.phase).toBe('recovery_after_deny');
    expect(assistantContent(body)).toMatch(/stopped the recording|recording is off/i);

    // Underlying CallState agrees.
    const state = getCallState(CALL_ID);
    expect(state?.consent_status).toBe('revoked');
    expect(state?.recording_active).toBe(false);
    expect(state?.receipts_emitted.length).toBeGreaterThan(0);
  });

  it('progresses recovery → callback confirmation → close (escalate_to_human queued)', async () => {
    await POST(callStart());
    await POST(callerSays('storm damage on my roof'));
    await POST(callerSays('stop recording me')); // → recovery_after_deny
    const cb = await jsonOf(await POST(callerSays('my name is Dana, 512-555-0123')));
    expect(marshalBlock(cb).phase).toBe('callback_confirmation');

    const close = await jsonOf(await POST(callerSays('tomorrow afternoon works')));
    expect(marshalBlock(close).phase).toBe('close');
    expect(marshalBlock(close).scheduled_actions as string[]).toContain('escalate_to_human');
    // toVapiResponse stamps end_call into the agentmarshal block; true at close.
    expect(marshalBlock(close).end_call).toBe(true);
  });

  it('ignores non-speech events (status updates) with an ack', async () => {
    const body = await jsonOf(
      await POST(makeRequest({ message: { type: 'status-update', status: 'in-progress', call: { id: CALL_ID } } })),
    );
    expect(body.ok).toBe(true);
  });
});

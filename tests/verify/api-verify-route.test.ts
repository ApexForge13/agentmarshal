import { describe, it, expect, beforeEach } from 'vitest';
import examples from '../../data/verify/example-receipts.json';
import { POST } from '../../app/api/verify/receipt/route';
import { GET } from '../../app/api/verify/public-key/route';
import { clearPublicKeyCache } from '../../lib/verify/load-public-key';

function postReceipt(receipt: unknown, raw?: string): Request {
  return new Request('http://localhost/api/verify/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify({ receipt }),
  });
}

describe('POST /api/verify/receipt (Bubble 10)', () => {
  beforeEach(() => clearPublicKeyCache());

  it('returns verified:true + details for a valid Compliance Receipt', async () => {
    const res = await POST(postReceipt(examples.valid_compliance));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.record_type).toBe('compliance_receipt');
    expect(body.details.agent_id).toBe('voice-001');
    expect(body.details.decision).toBe('deny');
    expect(body.details.composites_fired).toContain('voice_recording_consent_state_resolved');
  });

  it('returns verified:true for a valid Internal Audit envelope', async () => {
    const res = await POST(postReceipt(examples.valid_internal_audit));
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.record_type).toBe('internal_audit');
  });

  it('returns verified:false + signature mismatch for a tampered receipt', async () => {
    const res = await POST(postReceipt(examples.tampered_compliance));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.reason).toBe('signature mismatch');
  });

  it('400s on malformed JSON and on a missing receipt field', async () => {
    const bad = await POST(postReceipt(undefined, '{not json'));
    expect(bad.status).toBe(400);

    const noReceipt = await POST(postReceipt(undefined, JSON.stringify({ foo: 'bar' })));
    expect(noReceipt.status).toBe(400);
    expect((await noReceipt.json()).error).toMatch(/receipt/i);

    const nonObject = await POST(postReceipt(undefined, JSON.stringify({ receipt: 'string' })));
    expect(nonObject.status).toBe(400);
  });
});

describe('GET /api/verify/public-key (Bubble 10)', () => {
  beforeEach(() => clearPublicKeyCache());

  it('returns the published Ed25519 public key as hex + JWK', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.algorithm).toBe('ed25519');
    expect(body.raw_hex).toMatch(/^[a-f0-9]{64}$/);
    expect(body.jwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    expect(typeof body.jwk.x).toBe('string');
    expect(body.key_id).toBeTruthy();
    expect(body.public_key_fingerprint).toBeTruthy();
  });

  it('serves the same key the example receipts were signed with', async () => {
    const res = await GET();
    const body = await res.json();
    const sigFingerprint = (examples.valid_compliance as { signatures: Array<{ public_key_fingerprint: string }> })
      .signatures[0].public_key_fingerprint;
    expect(body.public_key_fingerprint).toBe(sigFingerprint);
  });
});

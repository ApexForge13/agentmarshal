import { describe, it, expect, beforeEach } from 'vitest';
import examples from '../../data/verify/example-receipts.json';
import { verifyReceipt } from '../../lib/verify/verify-receipt';
import { clearPublicKeyCache } from '../../lib/verify/load-public-key';

describe('verifyReceipt (Bubble 10)', () => {
  beforeEach(() => clearPublicKeyCache());

  it('verifies a valid Compliance Receipt and returns structured details', async () => {
    const r = await verifyReceipt(examples.valid_compliance);
    expect(r.verified).toBe(true);
    expect(r.record_type).toBe('compliance_receipt');
    expect(r.reason).toMatch(/valid/i);
    expect(r.details).toBeDefined();
    expect(r.details!.agent_id).toBe('voice-001');
    expect(r.details!.decision).toBe('deny');
    expect(r.details!.composites_fired).toContain('voice_recording_consent_state_resolved');
    expect(r.details!.previous_receipt_hash).toBeNull();
    expect(r.details!.issued_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('verifies a valid Internal Audit envelope (record_type retained in signed body)', async () => {
    const r = await verifyReceipt(examples.valid_internal_audit);
    expect(r.verified).toBe(true);
    expect(r.record_type).toBe('internal_audit');
    expect(r.details!.agent_id).toBe('personalizer-001');
    expect(r.details!.decision).toBe('allow');
  });

  it('reports a valid external timestamp alongside the signature (Bubble 11)', async () => {
    const r = await verifyReceipt(examples.valid_compliance);
    expect(r.verified).toBe(true);
    expect(r.timestamp.status).toBe('timestamped');
    if (r.timestamp.status === 'timestamped') {
      expect(r.timestamp.tsa).toBe('FreeTSA');
      expect(r.timestamp.timestamp_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("reports timestamp 'unavailable' for a receipt with no timestamp_token (still signature-valid)", async () => {
    const { timestamp_token: _omit, ...noTs } = examples.valid_compliance as Record<string, unknown>;
    const r = await verifyReceipt(noTs);
    expect(r.verified).toBe(true); // signature is independent of the timestamp
    expect(r.timestamp.status).toBe('unavailable');
  });

  it("fails a tampered receipt with 'signature mismatch'", async () => {
    const r = await verifyReceipt(examples.tampered_compliance);
    expect(r.verified).toBe(false);
    expect(r.record_type).toBe('compliance_receipt');
    expect(r.reason).toBe('signature mismatch');
  });

  it('errors gracefully on malformed / missing / unknown inputs (never throws)', async () => {
    // not an object
    expect((await verifyReceipt('nope')).reason).toMatch(/must be a JSON object/i);
    expect((await verifyReceipt(null)).record_type).toBe('unknown');

    // unknown record shape
    const unknown = await verifyReceipt({ hello: 'world' });
    expect(unknown.verified).toBe(false);
    expect(unknown.record_type).toBe('unknown');
    expect(unknown.reason).toMatch(/unknown record_type/i);

    // recognizable record but no signatures
    const { signatures: _omit, ...noSig } = examples.valid_compliance as Record<string, unknown>;
    const missing = await verifyReceipt(noSig);
    expect(missing.verified).toBe(false);
    expect(missing.record_type).toBe('compliance_receipt');
    expect(missing.reason).toBe('missing signature field');
  });

  it('reports a different-signing-key distinctly from a generic tamper', async () => {
    // A receipt "signed by a different key" presents both a signature that does
    // not validate against our published key AND a foreign fingerprint. (Editing
    // the fingerprint alone does NOT change the verdict — it lives inside the
    // stripped signatures array, so the real signature still validates; the
    // signature, not the self-asserted fingerprint, is authoritative.)
    const forged = structuredClone(examples.valid_compliance) as Record<string, unknown>;
    const sigs = forged.signatures as Array<Record<string, unknown>>;
    const realSig = sigs[0].signature as string;
    // Flip the first hex nibble so the signature no longer validates.
    sigs[0].signature = (realSig[0] === '0' ? '1' : '0') + realSig.slice(1);
    sigs[0].public_key_fingerprint = 'sha256:deadbeefnotourkey';
    const r = await verifyReceipt(forged);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/different key/i);
  });
});

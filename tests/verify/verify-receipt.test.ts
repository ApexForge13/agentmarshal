import { describe, it, expect, beforeEach } from 'vitest';
import examples from '../../data/verify/example-receipts.json';
import { verifyReceipt } from '../../lib/verify/verify-receipt';
import { clearPublicKeyCache } from '../../lib/verify/load-public-key';
import { FileKeyProvider } from '../../lib/compliance/keys/file-provider';
import { sign } from '../../lib/compliance/receipt/sign';
import { canonicalize } from '../../lib/compliance/receipt/canonical';

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

  it('verifies a three-state review receipt; review_required is in the signed body (Bubble 16)', async () => {
    const r = await verifyReceipt(examples.valid_review);
    expect(r.verified).toBe(true);
    expect(r.record_type).toBe('compliance_receipt');
    expect(r.details!.decision).toBe('deny'); // effect stays deny; review is the sibling
    expect(r.details!.review_required).toBe(true);
    expect(r.details!.composites_fired).toContain('entity_not_sanctioned');
    // Tampering review_required after signing must break the signature (it is part
    // of the signed bytes — no separate trust path for the three-state field).
    const forged = structuredClone(examples.valid_review) as Record<string, unknown>;
    forged.review_required = false;
    const bad = await verifyReceipt(forged);
    expect(bad.verified).toBe(false);
    expect(bad.reason).toMatch(/signature mismatch/i);
  });

  it('verifies a Compliance Receipt with a governed bd_call; bd_calls is in the signed body (Bubble 17)', async () => {
    const r = await verifyReceipt(examples.valid_with_bd_call);
    expect(r.verified).toBe(true);
    expect(r.record_type).toBe('compliance_receipt');
    expect(r.details!.bd_calls).toHaveLength(1);
    expect(r.details!.bd_calls![0].governance_result).toBe('permit');
    expect(r.details!.bd_calls![0].matched_rule_id).toBe('adverse_media_serp');
    // Tampering the response fingerprint after signing must break the signature —
    // bd_calls is part of the signed bytes, so no separate trust path is needed.
    const forged = structuredClone(examples.valid_with_bd_call) as Record<string, unknown>;
    (forged.bd_calls as Array<Record<string, unknown>>)[0].response_sha256 =
      '0000000000000000000000000000000000000000000000000000000000000000';
    const bad = await verifyReceipt(forged);
    expect(bad.verified).toBe(false);
    expect(bad.reason).toMatch(/signature mismatch/i);
  });

  it('existing fixtures carry no review flag (backward-compatible: review_required false)', async () => {
    const r = await verifyReceipt(examples.valid_compliance);
    expect(r.details!.review_required).toBe(false);
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

describe('verifyReceipt timestamp/issued_at cross-check (Bubble 12)', () => {
  beforeEach(() => clearPublicKeyCache());

  // genTime baked into the captured FreeTSA token (immutable, TSA-signed).
  const genTime = new Date(
    (examples.valid_compliance as { timestamp_token: { issued_at: string } }).timestamp_token
      .issued_at,
  );

  // Clone the valid receipt, move issued_at, and RE-SIGN over the modified body so the
  // signature itself is valid. receipt_hash + timestamp_token are left untouched (they
  // still match the genuine state), so the only break is issued_at vs genTime.
  async function withIssuedAt(offsetMs: number): Promise<Record<string, unknown>> {
    const handle = await new FileKeyProvider().getActiveSigningHandle();
    const receipt = structuredClone(examples.valid_compliance) as Record<string, unknown>;
    receipt.issued_at = new Date(genTime.getTime() + offsetMs).toISOString();
    const body = { ...receipt };
    delete body.signatures;
    delete body.timestamp_token;
    delete body.receipt_hash;
    delete body.record_type;
    const reSig = await sign(canonicalize(body), handle);
    const orig = (receipt.signatures as Array<Record<string, unknown>>)[0];
    receipt.signatures = [{ ...orig, signature: reSig.signature_hex, signed_at: receipt.issued_at }];
    return receipt;
  }

  it('accepts a receipt whose issued_at is within tolerance of the timestamp', async () => {
    const r = await verifyReceipt(await withIssuedAt(2 * 60 * 1000)); // +2 min
    expect(r.verified).toBe(true);
    expect(r.timestamp.status).toBe('timestamped');
  });

  it('rejects a backdated receipt (issued_at predates the external timestamp)', async () => {
    const r = await verifyReceipt(await withIssuedAt(-10 * 60 * 1000)); // -10 min
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/predates external timestamp/i);
    // The timestamp itself still verifies — it is the genTime that exposes the lie.
    expect(r.timestamp.status).toBe('timestamped');
  });

  it('rejects a future-dated receipt (issued_at far later than the external timestamp)', async () => {
    const r = await verifyReceipt(await withIssuedAt(10 * 60 * 1000)); // +10 min
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/significantly later than external timestamp/i);
  });

  it('does not run the cross-check when there is no verifying timestamp', async () => {
    // Strip the token: signature is still valid, no timestamp to cross-check against.
    const noTs = await withIssuedAt(-10 * 60 * 1000);
    delete noTs.timestamp_token;
    const r = await verifyReceipt(noTs);
    expect(r.verified).toBe(true);
    expect(r.timestamp.status).toBe('unavailable');
  });
});

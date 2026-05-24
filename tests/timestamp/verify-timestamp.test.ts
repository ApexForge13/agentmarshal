import { describe, it, expect } from 'vitest';
import { verifyTimestampToken } from '../../lib/compliance/timestamp/verify-timestamp';
import { tokenFor, fixtureHashes } from './fixtures/replay';

// Real FreeTSA token captured over the example receipt_hash (fixtures/freetsa-tokens.json).
const validToken = tokenFor(fixtureHashes.receipt)!;

describe('verifyTimestampToken', () => {
  it('accepts a real FreeTSA token over the matching hash (chains to pinned root)', () => {
    const r = verifyTimestampToken({
      tokenB64: validToken.token_b64,
      expectedHashHex: fixtureHashes.receipt,
    });
    expect(r.status).toBe('timestamped');
    if (r.status === 'timestamped') {
      expect(r.tsa).toBe('FreeTSA');
      expect(r.timestamp_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('rejects a tampered token (CMS signature no longer verifies)', () => {
    const buf = Buffer.from(validToken.token_b64, 'base64');
    buf[buf.length - 40] ^= 0xff; // corrupt a byte inside the TSA signature region
    const r = verifyTimestampToken({
      tokenB64: buf.toString('base64'),
      expectedHashHex: fixtureHashes.receipt,
    });
    expect(r.status).toBe('invalid');
  });

  it('rejects when the stamped hash does not match the receipt (hash mismatch)', () => {
    const r = verifyTimestampToken({
      tokenB64: validToken.token_b64,
      expectedHashHex: fixtureHashes.audit, // a real, different hash
    });
    expect(r.status).toBe('invalid');
    if (r.status === 'invalid') expect(r.reason).toMatch(/hash mismatch/i);
  });

  it('reports invalid (never throws) on a malformed token', () => {
    const r = verifyTimestampToken({
      tokenB64: 'bm90LWEtdG9rZW4=',
      expectedHashHex: fixtureHashes.receipt,
    });
    expect(r.status).toBe('invalid');
  });
});

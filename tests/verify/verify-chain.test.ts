import { describe, it, expect } from 'vitest';
import { verifyChain } from '../../lib/verify/verify-chain';
import fixtures from '../../data/benchmark/fixtures/audit-trail-fixtures.json';

type Receipt = Record<string, unknown>;
const validChain = fixtures.valid_chain as Receipt[];
const brokenChain = fixtures.broken_chain as Receipt[];

describe('verifyChain (Bubble 12)', () => {
  it('accepts an intact hash-chained sequence', () => {
    const r = verifyChain(validChain);
    expect(r.valid).toBe(true);
    expect(r.break_at).toBeUndefined();
  });

  it('rejects a broken chain and reports the break at the correct index', () => {
    // broken_chain = [b1, b2, b3] with the middle 'deny' receipt removed: b2's
    // previous_receipt_hash points to the deleted receipt, not to b1 (index 1).
    const r = verifyChain(brokenChain);
    expect(r.valid).toBe(false);
    expect(r.break_at).toBe(1);
    expect(r.reason).toMatch(/does not match/i);
  });

  it('treats empty and single-receipt chains as vacuously valid', () => {
    expect(verifyChain([])).toEqual({ valid: true, reason: expect.stringMatching(/empty/i) });
    const single = verifyChain([validChain[0]]);
    expect(single.valid).toBe(true);
    expect(single.break_at).toBeUndefined();
  });

  it('detects a back-link mismatch in a minimal two-receipt chain', () => {
    const a = { receipt_hash: 'a'.repeat(64), previous_receipt_hash: null };
    const b = { receipt_hash: 'b'.repeat(64), previous_receipt_hash: 'c'.repeat(64) };
    const r = verifyChain([a, b]);
    expect(r.valid).toBe(false);
    expect(r.break_at).toBe(1);
  });

  it('supports Internal Audit linkage (audit_hash / previous_audit_hash)', () => {
    const a = { audit_hash: 'd'.repeat(64), previous_audit_hash: null };
    const b = { audit_hash: 'e'.repeat(64), previous_audit_hash: 'd'.repeat(64) };
    expect(verifyChain([a, b]).valid).toBe(true);
  });
});

// Hash-chain verifier (Bubble 12). Walks an array of receipts / audit envelopes in
// chronological order and checks that each one's previous_receipt_hash links to the
// prior receipt's receipt_hash (previous_audit_hash → audit_hash for Internal Audit
// records, and the two forms may be mixed in one chain).
//
// This is the SEQUENCE-integrity layer, deliberately independent of single-receipt
// signature verification (verifyReceipt). Compose the two for full chain attestation:
// verifyChain proves no receipt was silently dropped or spliced out of the lineage,
// verifyReceipt proves each individual link is authentic and unmodified. A chain whose
// every receipt signature-verifies can still have a broken linkage (a 'deny' receipt
// removed from the middle) — that is exactly what this catches.
//
// No crypto here: pure linkage comparison over the committed hash fields. Never throws;
// a broken chain is a verdict, not an exception.

export interface ChainVerifyResult {
  valid: boolean;
  /** Index of the receipt whose back-link is broken (the FIRST break found). */
  break_at?: number;
  reason?: string;
}

type Obj = Record<string, unknown>;

/** The receipt's own integrity hash — receipt_hash, or audit_hash for Internal Audit. */
function hashOf(r: Obj): string | null {
  if (typeof r.receipt_hash === 'string') return r.receipt_hash;
  if (typeof r.audit_hash === 'string') return r.audit_hash;
  return null;
}

/** The back-link to the prior receipt. null ⇒ genesis (or absent). */
function prevLinkOf(r: Obj): string | null {
  if (typeof r.previous_receipt_hash === 'string') return r.previous_receipt_hash;
  if (typeof r.previous_audit_hash === 'string') return r.previous_audit_hash;
  return null;
}

/**
 * Verify the hash-chain linkage of a chronologically-ordered receipt sequence.
 * Returns at the first broken link. Empty and single-receipt chains are vacuously
 * valid (no in-sequence linkage to check — the genesis back-link points outside the
 * array and is not verifiable here).
 */
export function verifyChain(receipts: ReadonlyArray<Obj>): ChainVerifyResult {
  if (receipts.length === 0) {
    return { valid: true, reason: 'empty chain: no linkages to verify (vacuously intact)' };
  }
  if (receipts.length === 1) {
    return { valid: true, reason: 'single receipt: no in-sequence linkage to verify' };
  }

  for (let i = 1; i < receipts.length; i++) {
    const priorHash = hashOf(receipts[i - 1]);
    if (priorHash === null) {
      return {
        valid: false,
        break_at: i - 1,
        reason: `receipt at index ${i - 1} has no receipt_hash/audit_hash to chain from`,
      };
    }
    const link = prevLinkOf(receipts[i]);
    if (link !== priorHash) {
      return {
        valid: false,
        break_at: i,
        reason:
          `previous_receipt_hash at index ${i} (${link ?? 'null'}) does not match ` +
          `receipt_hash at index ${i - 1} (${priorHash})`,
      };
    }
  }

  return { valid: true, reason: `chain intact across ${receipts.length} receipts` };
}

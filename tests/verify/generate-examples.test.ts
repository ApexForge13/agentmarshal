// Generator + round-trip guard for data/verify/example-receipts.json.
//
// Run normally (npm test): builds the deterministic examples in-memory and
// asserts they round-trip through the verifier — does NOT write the file.
// Run via `pnpm generate:verify-examples` (sets GENERATE_VERIFY_EXAMPLES=1):
// also writes the committed example-receipts.json. Determinism (fixed seed +
// Ed25519) means the written bytes are identical every run → no churn.

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { buildExamples } from '../../lib/verify/build-examples';
import { verifyReceipt } from '../../lib/verify/verify-receipt';
import { clearPublicKeyCache } from '../../lib/verify/load-public-key';
import { createReplayTimestamper, fixtureIssuedAt } from '../timestamp/fixtures/replay';

const OUT_PATH = path.resolve(process.cwd(), 'data', 'verify', 'example-receipts.json');
const SHOULD_WRITE = process.env.GENERATE_VERIFY_EXAMPLES === '1';

describe('verify example generation', () => {
  it('builds deterministic examples that round-trip (and writes when asked)', async () => {
    clearPublicKeyCache();
    // Replay captured FreeTSA tokens so the committed examples carry real, offline-
    // verifiable timestamps without CI hitting the network. issued_at is read back
    // from the capture fixture so the rebuilt receipt_hash matches the captured token
    // AND issued_at ≈ genTime (within the Bubble 12 cross-check tolerance).
    const examples = await buildExamples({
      timestamper: createReplayTimestamper(),
      issuedAt: new Date(fixtureIssuedAt),
    });

    if (SHOULD_WRITE) {
      mkdirSync(path.dirname(OUT_PATH), { recursive: true });
      writeFileSync(OUT_PATH, JSON.stringify(examples, null, 2) + '\n', 'utf8');
      console.log(`wrote ${OUT_PATH}`);
    }

    const validC = await verifyReceipt(examples.valid_compliance);
    expect(validC.verified).toBe(true);
    expect(validC.record_type).toBe('compliance_receipt');
    // Real FreeTSA timestamp, verified offline against the pinned root.
    expect(validC.timestamp.status).toBe('timestamped');
    if (validC.timestamp.status === 'timestamped') {
      expect(validC.timestamp.tsa).toBe('FreeTSA');
      expect(validC.timestamp.timestamp_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    const validIA = await verifyReceipt(examples.valid_internal_audit);
    expect(validIA.verified).toBe(true);
    expect(validIA.record_type).toBe('internal_audit');
    expect(validIA.timestamp.status).toBe('timestamped');

    // Tampering the decision after signing breaks the SIGNATURE but not the
    // timestamp (receipt_hash is unchanged), so the time anchor still verifies.
    const tampered = await verifyReceipt(examples.tampered_compliance);
    expect(tampered.verified).toBe(false);
    expect(tampered.reason).toBe('signature mismatch');
    expect(tampered.timestamp.status).toBe('timestamped');

    // Bubble 16: the three-state review receipt is signature-valid; its
    // review_required is part of the signed body and surfaces in the verdict.
    // Built without a timestamper → timestamp 'unavailable', cross-check skipped.
    const review = await verifyReceipt(examples.valid_review);
    expect(review.verified).toBe(true);
    expect(review.record_type).toBe('compliance_receipt');
    expect(review.details?.review_required).toBe(true);
    expect(review.timestamp.status).toBe('unavailable');
  });
});

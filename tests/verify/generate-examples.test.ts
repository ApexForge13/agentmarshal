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
import { createReplayTimestamper } from '../timestamp/fixtures/replay';

const OUT_PATH = path.resolve(process.cwd(), 'data', 'verify', 'example-receipts.json');
const SHOULD_WRITE = process.env.GENERATE_VERIFY_EXAMPLES === '1';

describe('verify example generation', () => {
  it('builds deterministic examples that round-trip (and writes when asked)', async () => {
    clearPublicKeyCache();
    // Replay captured FreeTSA tokens so the committed examples carry real, offline-
    // verifiable timestamps without CI hitting the network.
    const examples = await buildExamples(createReplayTimestamper());

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
  });
});

// Generator + round-trip guard for data/benchmark/fixtures/audit-trail-fixtures.json
// and the five audit_trail scenario files. Same pattern as tests/verify/generate-examples.
//
// Run normally (pnpm test): builds the fixtures + scenarios in-memory and asserts each
// tamper is caught by the verifiers — does NOT write any file.
// Run via `pnpm generate:audit-trail-fixtures` (GENERATE_AUDIT_TRAIL_FIXTURES=1): also
// writes the committed fixtures JSON and the five scenario JSON files. Determinism
// (fixed seeds + Ed25519 + replayed FreeTSA token) means byte-identical output → no churn.

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import {
  buildAuditTrailFixtures,
  buildAuditTrailScenarios,
} from '../../lib/benchmark/build-audit-trail-fixtures';
import { verifyReceipt } from '../../lib/verify/verify-receipt';
import { verifyChain } from '../../lib/verify/verify-chain';
import { clearPublicKeyCache } from '../../lib/verify/load-public-key';
import { createReplayTimestamper, fixtureIssuedAt } from '../timestamp/fixtures/replay';

const FIXTURES_PATH = path.resolve(
  process.cwd(),
  'data',
  'benchmark',
  'fixtures',
  'audit-trail-fixtures.json',
);
const SCENARIOS_DIR = path.resolve(process.cwd(), 'data', 'benchmark', 'scenarios');
const SHOULD_WRITE = process.env.GENERATE_AUDIT_TRAIL_FIXTURES === '1';

describe('audit-trail fixture generation', () => {
  it('builds deterministic fixtures + scenarios that catch the right tampers (writes when asked)', async () => {
    clearPublicKeyCache();
    const fixtures = await buildAuditTrailFixtures({
      timestamper: createReplayTimestamper(),
      issuedAt: new Date(fixtureIssuedAt),
    });
    const scenarios = buildAuditTrailScenarios(fixtures);

    if (SHOULD_WRITE) {
      mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true });
      writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');
      mkdirSync(SCENARIOS_DIR, { recursive: true });
      for (const s of scenarios) {
        writeFileSync(
          path.join(SCENARIOS_DIR, `${s.id}.json`),
          JSON.stringify(s, null, 2) + '\n',
          'utf8',
        );
      }
      // eslint-disable-next-line no-console
      console.log(`wrote ${FIXTURES_PATH} + ${scenarios.length} scenario files`);
    }

    // A1 tampered receipt — signature breaks.
    const tampered = await verifyReceipt(fixtures.tampered_receipt);
    expect(tampered.verified).toBe(false);
    expect(tampered.reason).toMatch(/signature mismatch/i);

    // A2 broken chain — single relational break at index 1.
    expect(verifyChain(fixtures.valid_chain).valid).toBe(true);
    const broken = verifyChain(fixtures.broken_chain);
    expect(broken.valid).toBe(false);
    expect(broken.break_at).toBe(1);

    // A3 backdated receipt — signature valid, timestamp valid, issued_at predates genTime.
    const backdated = await verifyReceipt(fixtures.backdated_receipt);
    expect(backdated.verified).toBe(false);
    expect(backdated.reason).toMatch(/predates external timestamp/i);
    expect(backdated.timestamp.status).toBe('timestamped');

    // A4 forged signature — signed by a different key.
    const forged = await verifyReceipt(fixtures.forged_receipt);
    expect(forged.verified).toBe(false);
    expect(forged.reason).toMatch(/different key/i);

    // A5 valid baseline — verifies offline.
    const valid = await verifyReceipt(fixtures.valid_receipt);
    expect(valid.verified).toBe(true);
    expect(valid.timestamp.status).toBe('timestamped');
  });
});

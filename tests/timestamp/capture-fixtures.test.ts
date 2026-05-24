// Captures REAL FreeTSA timestamp responses over the deterministic /verify example
// hashes and writes them to fixtures/freetsa-tokens.json. Hits the network, so it
// is gated behind CAPTURE_TSA_FIXTURES=1 and skipped in CI.
//
//   CAPTURE_TSA_FIXTURES=1 pnpm exec vitest run tests/timestamp/capture-fixtures.test.ts
//
// The committed tokens are then replayed by tests/timestamp/fixtures/replay.ts so
// the example generator and the verify tests are deterministic and offline.

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { buildExamples } from '../../lib/verify/build-examples';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
} from '../../lib/compliance/timestamp/tsa-client';
import { FREETSA_URL } from '../../lib/compliance/timestamp/freetsa-ca';

const CAPTURE = process.env.CAPTURE_TSA_FIXTURES === '1';
const OUT = path.resolve(process.cwd(), 'tests/timestamp/fixtures/freetsa-tokens.json');

async function captureFor(hashHex: string): Promise<string> {
  const reqDer = buildTimeStampRequest(hashHex);
  const resp = await fetch(FREETSA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/timestamp-query' },
    body: new Uint8Array(reqDer),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`FreeTSA HTTP ${resp.status}`);
  const respDer = Buffer.from(await resp.arrayBuffer());
  const parsed = parseTimeStampResponse(respDer);
  // Sanity: the TSA must have stamped exactly our hash.
  expect(parsed.imprintHashHex.toLowerCase()).toBe(hashHex.toLowerCase());
  return respDer.toString('base64');
}

describe('capture FreeTSA fixtures (manual, network)', () => {
  it.skipIf(!CAPTURE)('hits real FreeTSA and writes fixtures/freetsa-tokens.json', async () => {
    const examples = await buildExamples();
    const receiptHash = (examples.valid_compliance as Record<string, unknown>).receipt_hash as string;
    const auditHash = (examples.valid_internal_audit as Record<string, unknown>).audit_hash as string;

    const [receiptResp, auditResp] = await Promise.all([
      captureFor(receiptHash),
      captureFor(auditHash),
    ]);

    const fixtures = {
      note: 'Real FreeTSA RFC 3161 responses over the deterministic /verify example hashes. Re-capture with CAPTURE_TSA_FIXTURES=1 if the example seed (and thus receipt_hash/audit_hash) changes.',
      captured_at: new Date().toISOString(),
      receipt: { hashHex: receiptHash, responseB64: receiptResp },
      audit: { hashHex: auditHash, responseB64: auditResp },
    };
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');
    console.log(`wrote ${OUT}\n  receipt_hash=${receiptHash}\n  audit_hash=${auditHash}`);
    expect(receiptResp.length).toBeGreaterThan(100);
    expect(auditResp.length).toBeGreaterThan(100);
  }, 60000);
});

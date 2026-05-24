// Manual end-to-end check against the REAL FreeTSA. NOT run in CI.
//
//   pnpm tsx scripts/check-freetsa.mts
//
// Submits a live RFC 3161 timestamp request, then verifies the returned token
// fully offline against the pinned FreeTSA root — the same path receipt emission
// and /verify use. Surfaces each step so a TSA outage or a verification
// regression is obvious. Exits non-zero on any failure.
//
// This script imports only the timestamp client/verifier (not the receipt builder),
// so it does NOT touch the ESM-only `canonicalize` chain and runs cleanly under tsx.

import { createHash } from 'node:crypto';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
} from '../lib/compliance/timestamp/tsa-client';
import { verifyTimestampToken } from '../lib/compliance/timestamp/verify-timestamp';
import { FREETSA_URL } from '../lib/compliance/timestamp/freetsa-ca';

function log(step: string, detail = '') {
  console.log(`  ${step}${detail ? ': ' + detail : ''}`);
}

async function main() {
  console.log(`FreeTSA round-trip check → ${FREETSA_URL}`);

  // A stand-in "receipt_hash": SHA-256 of some unique payload.
  const hashHex = createHash('sha256')
    .update(`agentmarshal check-freetsa ${new Date().toISOString()}`)
    .digest('hex');
  log('1. receipt hash to stamp', hashHex);

  const reqDer = buildTimeStampRequest(hashHex);
  log('2. built TimeStampReq', `${reqDer.length} bytes DER`);

  const resp = await fetch(FREETSA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/timestamp-query' },
    body: new Uint8Array(reqDer),
    signal: AbortSignal.timeout(15000),
  });
  log('3. HTTP response', `${resp.status} ${resp.headers.get('content-type') ?? ''}`);
  if (!resp.ok) throw new Error(`FreeTSA returned HTTP ${resp.status}`);

  const respDer = Buffer.from(await resp.arrayBuffer());
  const parsed = parseTimeStampResponse(respDer);
  log('4. parsed token', `genTime=${parsed.genTime.toISOString()}, ${parsed.tokenDer.length} bytes`);
  log('   stamped imprint matches', String(parsed.imprintHashHex === hashHex));

  const tokenB64 = parsed.tokenDer.toString('base64');
  const verdict = verifyTimestampToken({ tokenB64, expectedHashHex: hashHex });
  log('5. offline verification', JSON.stringify(verdict));

  if (verdict.status !== 'timestamped') {
    throw new Error(`verification did not return 'timestamped': ${JSON.stringify(verdict)}`);
  }
  console.log('\n✓ FreeTSA round-trip OK — token issued and verified offline against the pinned root.');
}

main().catch((err) => {
  console.error(`\n✗ FreeTSA check FAILED: ${(err as Error).message}`);
  process.exit(1);
});

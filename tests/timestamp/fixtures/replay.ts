// Replays captured FreeTSA responses (freetsa-tokens.json) as a deterministic,
// offline Timestamper. The example generator and the timestamp tests use this so
// committed bytes stay byte-stable and CI never depends on FreeTSA uptime. The
// captured artifacts are REAL FreeTSA tokens, so they verify against the pinned
// FreeTSA root exactly as a live token would. Re-capture: see capture-fixtures.test.ts.

import fixtures from './freetsa-tokens.json';
import { parseTimeStampResponse } from '../../../lib/compliance/timestamp/tsa-client';
import { FREETSA_TSA_NAME } from '../../../lib/compliance/timestamp/freetsa-ca';
import type { Timestamper, TimestampToken } from '../../../lib/compliance/timestamp/types';

const entries = [fixtures.receipt, fixtures.audit];

export const fixtureHashes = {
  receipt: fixtures.receipt.hashHex,
  audit: fixtures.audit.hashHex,
};

// The issued_at the captured tokens correspond to (the example bodies were built with
// it; FreeTSA stamped their hashes at ≈ this instant). Consumers that rebuild the
// examples MUST use this so receipt_hash matches the captured token. Falls back to the
// genTime if an older fixture predates the issued_at field.
export const fixtureIssuedAt: string =
  (fixtures as { issued_at?: string }).issued_at ??
  tokenFor(fixtures.receipt.hashHex)?.issued_at ??
  '';

/** The captured token for a given receipt_hash/audit_hash, or null if not captured. */
export function tokenFor(hashHex: string): TimestampToken | null {
  const entry = entries.find((e) => e.hashHex.toLowerCase() === hashHex.toLowerCase());
  if (!entry) return null;
  const parsed = parseTimeStampResponse(Buffer.from(entry.responseB64, 'base64'));
  return {
    tsa: FREETSA_TSA_NAME,
    token_b64: parsed.tokenDer.toString('base64'),
    issued_at: parsed.genTime.toISOString(),
  };
}

/** A Timestamper that replays captured FreeTSA tokens — drop-in for the real client. */
export function createReplayTimestamper(): Timestamper {
  return {
    async timestamp(hashHex: string): Promise<TimestampToken | null> {
      return tokenFor(hashHex);
    },
  };
}

// RFC 3161 timestamp types for Compliance Receipts / Internal Audit records.
//
// A receipt's integrity anchor (receipt_hash / audit_hash) is submitted to a
// Time Stamping Authority (TSA); the TSA returns a signed Timestamp Token (TST)
// proving that exact hash existed at time T per an independent third party. The
// token is stored at the top level of the envelope as `timestamp_token` and is
// NOT part of the signed body (it is added after signing, same treatment as the
// signatures array, and is stripped before canonicalization on verify).

/** Stored, top-level envelope field. `null`/absent ⇒ not externally timestamped. */
export interface TimestampToken {
  /** Human-readable TSA identifier. v0.2: always 'FreeTSA'. */
  tsa: string;
  /** base64 of the DER-encoded RFC 3161 TimeStampToken (a CMS ContentInfo). */
  token_b64: string;
  /** ISO 8601 genTime extracted from the token's TSTInfo at issuance. Informational;
   *  the authoritative time is re-derived from the token on verify. */
  issued_at: string;
}

/**
 * Verifier verdict for the timestamp, reported SEPARATELY from signature validity.
 *  - timestamped: token present, cert chains to the pinned TSA root, and the
 *    stamped hash matches the receipt's hash.
 *  - unavailable: no token on the envelope (older receipt, or TSA was unreachable
 *    at issuance). The receipt is still signature-valid; it just has no third-party
 *    time anchor.
 *  - invalid: a token is present but failed verification (with a specific reason).
 */
export type TimestampResult =
  | { status: 'timestamped'; tsa: string; timestamp_at: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'invalid'; reason: string };

/**
 * Pluggable TSA client. Production wires `createFreeTsaTimestamper()`; tests and
 * the deterministic example generator inject a fixed-token stand-in so CI never
 * depends on TSA uptime. `hashHex` is the receipt_hash / audit_hash (a SHA-256
 * hex string). Implementations MUST NOT throw — return null on any failure so a
 * TSA outage degrades to "signed but not timestamped" rather than failing the build.
 */
export interface Timestamper {
  timestamp(hashHex: string): Promise<TimestampToken | null>;
}

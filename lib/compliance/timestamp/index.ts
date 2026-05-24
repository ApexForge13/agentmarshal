// Public API for RFC 3161 external timestamp anchoring.
//
// Timestamping is OPTIONAL per-receipt: emission wires createFreeTsaTimestamper()
// into the receipt/audit builders, which degrade to an un-timestamped (but still
// signed) receipt if the TSA is unreachable. Verification reports timestamp
// validity SEPARATELY from signature validity. See ./README.md.

export type { TimestampToken, TimestampResult, Timestamper } from './types';
export {
  buildTimeStampRequest,
  parseTimeStampResponse,
  parseTimeStampToken,
  createFreeTsaTimestamper,
  toArrayBuffer,
  TsaError,
  SHA256_OID,
  DIGEST_BY_OID,
  type FreeTsaTimestamperOptions,
  type ParsedTimestampToken,
  type ParsedTimestampResponse,
} from './tsa-client';
export { verifyTimestampToken, type VerifyTimestampInput } from './verify-timestamp';
export { FREETSA_TSA_NAME, FREETSA_URL, FREETSA_ROOT_PEM, freeTsaRoot } from './freetsa-ca';

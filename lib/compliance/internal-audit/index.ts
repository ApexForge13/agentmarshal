// Public API for InternalAuditRecord v0.1.
//
// Crypto substrate (canonicalize, sha256Hex, sign, verify) lives in
// lib/compliance/receipt/* and is shared by both envelope types — there is
// intentionally no duplicate primitive code here.

export type {
  InternalAuditRecord,
  InternalAuditAgent,
  InternalAuditAction,
  InternalAuditContract,
  InternalAuditDecision,
  InternalAuditEvaluation,
  AuditRecordSignature,
  AgentType,
  RegulatoryStateAnchor,
  SignerRole,
} from './types';
export {
  buildInternalAuditRecord,
  computeAuditHash,
  resolveCodeVersion,
  PENDING_REGULATORY_STATE,
  type BuildInternalAuditRecordInput,
} from './builder';
export { validateInternalAuditRecord, type AuditRecordValidationResult } from './schema';

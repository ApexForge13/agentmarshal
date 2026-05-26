// InternalAuditRecord builder.
//
// Construction order (locked, parallel to buildReceipt in lib/compliance/receipt/builder.ts):
//   1. Validate input.signers is non-empty.
//   2. Build body B = all record fields except audit_hash and signatures.
//   3. canonicalBody = canonicalize(B).
//   4. For each signer: sigResult = sign(canonicalBody, handle); append to signatures.
//   5. preHashRecord = B ∪ { signatures }.
//   6. audit_hash = sha256Hex(canonicalize(preHashRecord)).
//   7. final = preHashRecord ∪ { audit_hash }.
//   8. validate(final) — schema violations are builder bugs, not consumer concerns.
//
// Crypto substrate is shared with Compliance Receipts (no duplicate primitives):
// canonicalize, sha256Hex, sign all imported from lib/compliance/receipt/*.

import { randomUUID } from 'crypto';
import { canonicalize } from '@/lib/compliance/receipt/canonical';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import { sign } from '@/lib/compliance/receipt/sign';
import { resolveCodeVersion, PENDING_REGULATORY_STATE } from '@/lib/compliance/receipt/builder';
import { validateInternalAuditRecord } from './schema';
import type {
  InternalAuditRecord,
  InternalAuditAgent,
  InternalAuditAction,
  InternalAuditContract,
  AuditRecordSignature,
  SignerRole,
} from './types';
import type { RegulatoryStateAnchor } from '@/lib/compliance/receipt/types';
import type { EvaluationResult } from '@/types/authzen';
import type { SigningHandle } from '@/lib/compliance/keys/provider';
import type { Timestamper } from '@/lib/compliance/timestamp/types';

export { PENDING_REGULATORY_STATE, resolveCodeVersion };

export interface BuildInternalAuditRecordInput {
  evaluationResult: EvaluationResult;
  tenantId: string;
  evaluationId: string;
  requestId: string;
  agent: InternalAuditAgent;
  action: InternalAuditAction;
  contract: InternalAuditContract;
  codeVersion?: string;
  previousAuditHash?: string | null;
  regulatoryState?: RegulatoryStateAnchor;
  issuedAt?: Date;
  recordId?: string;
  signers: Array<{ handle: SigningHandle; role: SignerRole; signedAt?: Date }>;
  // Optional RFC 3161 timestamper over audit_hash. See buildReceipt for semantics.
  timestamper?: Timestamper;
}

export function computeAuditHash(
  recordWithoutHash: Omit<InternalAuditRecord, 'audit_hash'>,
): string {
  return sha256Hex(canonicalize(recordWithoutHash));
}

function generateRecordId(): string {
  return `ia-${randomUUID()}`;
}

export async function buildInternalAuditRecord(
  input: BuildInternalAuditRecordInput,
): Promise<InternalAuditRecord> {
  if (input.signers.length === 0) {
    throw new Error('buildInternalAuditRecord: at least one signer is required');
  }

  const issuedAt = (input.issuedAt ?? new Date()).toISOString();
  const codeVersion = input.codeVersion ?? resolveCodeVersion();
  const previousAuditHash = input.previousAuditHash ?? null;
  const regulatoryState = input.regulatoryState ?? PENDING_REGULATORY_STATE;
  const er = input.evaluationResult;

  const body = {
    internal_audit_version: '0.1' as const,
    schema_version: '0.1' as const,
    record_type: 'internal_audit' as const,
    record_id: input.recordId ?? generateRecordId(),
    previous_audit_hash: previousAuditHash,
    canonical_form: 'rfc8785' as const,
    issued_at: issuedAt,
    code_version: codeVersion,
    tenant_id: input.tenantId,
    evaluation_id: input.evaluationId,
    request_id: input.requestId,
    agent: input.agent,
    action: input.action,
    contract: input.contract,
    evaluation: {
      predicate_evaluations: er.predicate_evaluations,
      composite_evaluations: er.composite_evaluations ?? [],
      decision: {
        effect: er.effect,
        evaluation_path: er.evaluation_path,
        matched_rule_id: er.matched_rule_id,
        reason_code: er.reason_code,
        reason: er.reason,
      },
    },
    // Bubble 16: envelope-level three-state, emitted ONLY when review is required.
    // JCS sorts keys, so absence reproduces pre-Bubble-16 bytes exactly.
    ...(er.review_required
      ? {
          review_required: true as const,
          ...(er.review_reason !== undefined ? { review_reason: er.review_reason } : {}),
        }
      : {}),
    regulatory_state: regulatoryState,
  };

  const canonicalBody = canonicalize(body);

  const signatures: AuditRecordSignature[] = [];
  for (const { handle, role, signedAt } of input.signers) {
    const sigResult = await sign(canonicalBody, handle);
    signatures.push({
      algorithm: sigResult.algorithm,
      key_id: sigResult.key_id,
      public_key_fingerprint: sigResult.public_key_fingerprint,
      signature: sigResult.signature_hex,
      signed_at: (signedAt ?? new Date()).toISOString(),
      signer_role: role,
    });
  }

  const preHashRecord = { ...body, signatures };
  const audit_hash = computeAuditHash(preHashRecord);
  const final: InternalAuditRecord = { ...preHashRecord, audit_hash };

  const validation = validateInternalAuditRecord(final);
  if (!validation.valid) {
    throw new Error(
      `buildInternalAuditRecord: produced record failed schema validation: ${validation.errors.join('; ')}`,
    );
  }

  // External timestamp anchor over audit_hash (best-effort, post-signing). See
  // buildReceipt — same exclusion from audit_hash and signed body.
  if (input.timestamper) {
    const timestamp_token = await input.timestamper.timestamp(audit_hash);
    return { ...final, timestamp_token };
  }

  return final;
}

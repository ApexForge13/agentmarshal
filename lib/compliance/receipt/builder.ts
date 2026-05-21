// ComplianceReceipt builder.
//
// Construction order (locked):
//   1. Validate input.signers is non-empty.
//   2. Build body B = all receipt fields except receipt_hash and signatures.
//   3. canonicalBody = canonicalize(B).
//   4. For each signer: sigResult = sign(canonicalBody, handle); append to signatures.
//   5. preHashReceipt = B ∪ { signatures }.
//   6. receipt_hash = sha256Hex(canonicalize(preHashReceipt)).
//   7. final = preHashReceipt ∪ { receipt_hash }.
//   8. validate(final) — schema violations are builder bugs, not consumer concerns.
//
// Why the signed payload excludes both receipt_hash and signatures:
// signatures must be appended without invalidating earlier signers' bytes
// (multi-sig), and receipt_hash necessarily can't include itself.

import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { canonicalize } from './canonical';
import { sha256Hex } from './hash';
import { sign } from './sign';
import { validateReceipt } from './schema';
import type {
  ComplianceReceipt,
  ReceiptSignature,
  RegulatoryStateAnchor,
  SignerRole,
} from './types';
import type { EvaluationResult } from '@/types/authzen';
import type { SigningHandle } from '@/lib/compliance/keys/provider';

export const PENDING_REGULATORY_STATE: RegulatoryStateAnchor = {
  hash: null,
  pending: true,
  snapshot_source: null,
  anchor_timestamp: null,
  anchor_method: 'pending',
};

export function resolveCodeVersion(): string {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.env.AGENTMARSHAL_CODE_VERSION ?? 'unknown';
  }
}

export interface BuildReceiptInput {
  evaluationResult: EvaluationResult;
  tenantId: string;
  agentId: string;
  contractId: string;
  contractVersion: string;
  evaluationId: string;
  requestId: string;
  codeVersion?: string;
  previousReceiptHash?: string | null;
  regulatoryState?: RegulatoryStateAnchor;
  issuedAt?: Date;
  signers: Array<{ handle: SigningHandle; role: SignerRole }>;
}

export function computeReceiptHash(
  receiptWithoutHash: Omit<ComplianceReceipt, 'receipt_hash'>,
): string {
  return sha256Hex(canonicalize(receiptWithoutHash));
}

export async function buildReceipt(input: BuildReceiptInput): Promise<ComplianceReceipt> {
  if (input.signers.length === 0) {
    throw new Error('buildReceipt: at least one signer is required');
  }

  const issuedAt = (input.issuedAt ?? new Date()).toISOString();
  const codeVersion = input.codeVersion ?? resolveCodeVersion();
  const previousReceiptHash = input.previousReceiptHash ?? null;
  const regulatoryState = input.regulatoryState ?? PENDING_REGULATORY_STATE;
  const er = input.evaluationResult;

  const body = {
    receipt_version: '0.1' as const,
    schema_version: '0.1' as const,
    receipt_id: randomUUID(),
    previous_receipt_hash: previousReceiptHash,
    canonical_form: 'rfc8785' as const,
    issued_at: issuedAt,
    code_version: codeVersion,
    contract_id: input.contractId,
    contract_version: input.contractVersion,
    tenant_id: input.tenantId,
    agent_id: input.agentId,
    evaluation_id: input.evaluationId,
    request_id: input.requestId,
    decision: {
      effect: er.effect,
      evaluation_path: er.evaluation_path,
      matched_rule_id: er.matched_rule_id,
      reason_code: er.reason_code,
      reason: er.reason,
    },
    predicate_evaluations: er.predicate_evaluations,
    composite_evaluations: er.composite_evaluations ?? [],
    regulatory_state: regulatoryState,
  };

  const canonicalBody = canonicalize(body);

  const signatures: ReceiptSignature[] = [];
  for (const { handle, role } of input.signers) {
    const sigResult = await sign(canonicalBody, handle);
    signatures.push({
      algorithm: sigResult.algorithm,
      key_id: sigResult.key_id,
      public_key_fingerprint: sigResult.public_key_fingerprint,
      signature: sigResult.signature_hex,
      signed_at: new Date().toISOString(),
      signer_role: role,
    });
  }

  const preHashReceipt = { ...body, signatures };
  const receipt_hash = computeReceiptHash(preHashReceipt);
  const final: ComplianceReceipt = { ...preHashReceipt, receipt_hash };

  const validation = validateReceipt(final);
  if (!validation.valid) {
    throw new Error(
      `buildReceipt: produced receipt failed schema validation: ${validation.errors.join('; ')}`,
    );
  }

  return final;
}

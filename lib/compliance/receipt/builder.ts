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
import type { EvaluationResult, BDCallAudit } from '@/types/authzen';
import type { SigningHandle } from '@/lib/compliance/keys/provider';
import type { Timestamper } from '@/lib/compliance/timestamp/types';

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
  receiptId?: string;
  signers: Array<{ handle: SigningHandle; role: SignerRole; signedAt?: Date }>;
  // Bubble 17: optional governed Bright Data call audit entries. When non-empty,
  // a bd_calls array is added to the SIGNED body (so tampering with it after
  // signing breaks the signature). Omit / empty ⇒ no bd_calls field, keeping
  // pre-Bubble-17 receipts byte-identical.
  bdCalls?: BDCallAudit[];
  // Optional RFC 3161 timestamper. When provided, the finished receipt_hash is
  // submitted to the TSA and the token attached as timestamp_token. Omit to skip
  // external timestamping entirely (the default — no network, no field added).
  timestamper?: Timestamper;
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
    receipt_id: input.receiptId ?? randomUUID(),
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
    // Bubble 16: emit the three-state fields ONLY when review is required. JCS
    // sorts keys, so absence (the green/red case) reproduces pre-Bubble-16 bytes
    // exactly — existing signed receipts verify unchanged.
    ...(er.review_required
      ? {
          review_required: true as const,
          ...(er.review_reason !== undefined ? { review_reason: er.review_reason } : {}),
        }
      : {}),
    predicate_evaluations: er.predicate_evaluations,
    composite_evaluations: er.composite_evaluations ?? [],
    // Bubble 17: only emit bd_calls when present. JCS sorts keys, so absence
    // reproduces pre-Bubble-17 bytes exactly — existing signed receipts verify unchanged.
    ...(input.bdCalls && input.bdCalls.length > 0 ? { bd_calls: input.bdCalls } : {}),
    regulatory_state: regulatoryState,
  };

  const canonicalBody = canonicalize(body);

  const signatures: ReceiptSignature[] = [];
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

  const preHashReceipt = { ...body, signatures };
  const receipt_hash = computeReceiptHash(preHashReceipt);
  const final: ComplianceReceipt = { ...preHashReceipt, receipt_hash };

  const validation = validateReceipt(final);
  if (!validation.valid) {
    throw new Error(
      `buildReceipt: produced receipt failed schema validation: ${validation.errors.join('; ')}`,
    );
  }

  // External timestamp anchor (best-effort, post-signing). The timestamper never
  // throws — a TSA outage yields null and the receipt ships signed-but-not-stamped.
  // timestamp_token is excluded from receipt_hash (added here, after it is computed)
  // and from the signed body (verifiers strip it before recomputing signed bytes).
  if (input.timestamper) {
    const timestamp_token = await input.timestamper.timestamp(receipt_hash);
    return { ...final, timestamp_token };
  }

  return final;
}

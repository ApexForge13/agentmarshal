// Deterministic builder for the /verify example receipts. Calls the REAL
// emit-and-sign helpers (buildReceipt / buildInternalAuditRecord) with fixed
// seed data so the output is byte-stable across runs (Ed25519 is deterministic;
// issued_at / ids / code_version / signed_at are all pinned). Re-runnable if
// seed data changes via scripts/generate-verify-examples.mts.
//
// NOTE: imports the ESM-only `canonicalize` chain transitively, so this module
// must run under an ESM-capable resolver (Next bundler or vitest) — never tsx-CJS.

import { buildReceipt } from '@/lib/compliance/receipt/builder';
import { buildInternalAuditRecord } from '@/lib/compliance/internal-audit/builder';
import { FileKeyProvider } from '@/lib/compliance/keys/file-provider';
import type { EvaluationResult } from '@/types/authzen';
import type { Timestamper } from '@/lib/compliance/timestamp/types';

// issued_at / signed_at are NO LONGER hardcoded: they are sourced from the gated
// FreeTSA capture's recorded issued_at (tests/timestamp/fixtures/freetsa-tokens.json)
// and injected by the caller — see BuildExamplesOptions. This keeps issued_at ≈ the
// token's genTime (capture stamps the hash of the issued_at body within ~1s), which
// is a precondition for verifyReceipt's timestamp/issued_at cross-check (Bubble 12).
// Pinning issued_at to a round constant (the prior approach) left a ~22.5h gap that
// the cross-check would have flagged as a false-positive backdating.
const FIXED = {
  codeVersion: 'agentmarshal-v0.2-bubble10',
  receiptId: '11111111-1111-4111-8111-111111111111',
  auditRecordId: 'ia-22222222-2222-4222-8222-222222222222',
  evaluationId: '33333333-3333-4333-8333-333333333333',
  requestId: '44444444-4444-4444-8444-444444444444',
};

// voice-001 consent-revoked deny: the consent composite fails, the 3 Bubble-3
// voice stubs return 'stub' (also non-allow), so the rule's allow is blocked and
// evaluation falls through to the implicit no_match deny.
const VOICE_DENY: EvaluationResult = {
  effect: 'deny',
  evaluation_path: 'no_match',
  matched_rule_id: null,
  out_of_scope_term: null,
  reason_code: 'NO_MATCH_IMPLICIT_DENY',
  reason: 'No declared_scope rule matched; implicit deny per Scope Contract semantics.',
  predicate_evaluations: [
    {
      rule_id: 'voice-v1-base',
      predicate_path: 'subject.id',
      constraint: { exists: true },
      actual_value: 'voice-001',
      result: 'pass',
      reason: 'subject.id is present',
    },
  ],
  composite_evaluations: [
    {
      predicate: 'voice_recording_consent_state_resolved',
      result: 'fail',
      reason:
        'recording consent revoked by caller for call demo-call-001 (state TX); record_call must not proceed',
      details: { caller_state: 'TX', call_id: 'demo-call-001', consent_status: 'revoked' },
    },
    {
      predicate: 'voice_abandonment_rate_compliant',
      result: 'stub',
      reason: 'abandonment-rate telemetry not yet implemented',
      details: { deferred_to: 'Voice agent integration' },
    },
    {
      predicate: 'voice_prerecorded_disclosure_present',
      result: 'stub',
      reason: 'prerecorded-disclosure runtime check not yet implemented',
      details: { deferred_to: 'Voice agent integration' },
    },
    {
      predicate: 'voice_caller_id_accurate',
      result: 'stub',
      reason: 'outbound caller-ID transmission verification not yet implemented',
      details: { deferred_to: 'Voice agent integration' },
    },
  ],
};

// personalizer-001 score_lead allow: non-customer-touching agent → Internal Audit.
const PERSONALIZER_ALLOW: EvaluationResult = {
  effect: 'allow',
  evaluation_path: 'declared_scope',
  matched_rule_id: 'operational-v1-base',
  out_of_scope_term: null,
  reason_code: 'OPERATIONAL_V1_ALLOWED',
  reason: 'Operational v1 checks passed.',
  predicate_evaluations: [
    {
      rule_id: 'operational-v1-base',
      predicate_path: 'subject.id',
      constraint: { exists: true },
      actual_value: 'personalizer-001',
      result: 'pass',
      reason: 'subject.id is present',
    },
  ],
  composite_evaluations: [],
};

export interface VerifyExamples {
  valid_compliance: Record<string, unknown>;
  valid_internal_audit: Record<string, unknown>;
  tampered_compliance: Record<string, unknown>;
}

export interface BuildExamplesOptions {
  // Injected by the generator so the committed examples carry real FreeTSA timestamp
  // tokens deterministically (replayed from captured fixtures) — CI never hits the
  // network. Omit it and the examples build without timestamps.
  timestamper?: Timestamper;
  // issued_at + signed_at for the deterministic examples. Sourced from the gated
  // FreeTSA capture's recorded issued_at so issued_at ≈ the token's genTime (see the
  // FIXED comment above). The capture test passes a fresh `new Date()`; the example
  // generator reads it back from freetsa-tokens.json. Required — never defaulted to a
  // constant, which would reintroduce the issued_at/genTime gap.
  issuedAt: Date;
}

export async function buildExamples({
  timestamper,
  issuedAt,
}: BuildExamplesOptions): Promise<VerifyExamples> {
  const handle = await new FileKeyProvider().getActiveSigningHandle();
  const signedAt = issuedAt;

  const receipt = await buildReceipt({
    evaluationResult: VOICE_DENY,
    tenantId: 'default',
    agentId: 'voice-001',
    contractId: 'voice_v1',
    contractVersion: '0.1',
    evaluationId: FIXED.evaluationId,
    requestId: FIXED.requestId,
    codeVersion: FIXED.codeVersion,
    previousReceiptHash: null,
    issuedAt,
    receiptId: FIXED.receiptId,
    signers: [{ handle, role: 'agentmarshal', signedAt }],
    timestamper,
  });

  // Mirror the API wrapper: the route attaches record_type at response level.
  const valid_compliance = { record_type: 'compliance_receipt', ...receipt };

  const valid_internal_audit = (await buildInternalAuditRecord({
    evaluationResult: PERSONALIZER_ALLOW,
    tenantId: 'default',
    evaluationId: FIXED.evaluationId,
    requestId: FIXED.requestId,
    codeVersion: FIXED.codeVersion,
    agent: { id: 'personalizer-001', type: 'Personalizer', version: 'v0.2' },
    action: { type: 'score_lead', inputs: { lead_id: 'lead-1234' }, outputs: {} },
    contract: { id: 'operational_v1', version: '0.1' },
    previousAuditHash: null,
    issuedAt,
    recordId: FIXED.auditRecordId,
    signers: [{ handle, role: 'agentmarshal', signedAt }],
    timestamper,
  })) as unknown as Record<string, unknown>;

  // Tamper: flip the signed decision from deny → permit AFTER signing. The
  // signature was computed over the 'deny' body, so verification must fail.
  const tampered_compliance = structuredClone(valid_compliance) as Record<string, unknown>;
  const tamperedDecision = tampered_compliance.decision as Record<string, unknown>;
  tamperedDecision.effect = 'permit';
  tamperedDecision.reason_code = 'TAMPERED_TO_PERMIT';
  tamperedDecision.reason = 'decision field altered after signing (tamper demo)';

  return { valid_compliance, valid_internal_audit, tampered_compliance };
}

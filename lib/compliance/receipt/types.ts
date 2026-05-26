// ComplianceReceipt v0.1 types — TS mirror of spec/v0.1/compliance-receipt.schema.json.
// The JSON Schema is the normative source; this file MUST stay structurally aligned.

import type { PredicateEvaluation } from '@/types/authzen';
import type { CompositePredicateEvaluation } from '@/lib/authzen/composite-dispatch';
import type { TimestampToken } from '@/lib/compliance/timestamp/types';

export type SignerRole = 'agentmarshal' | 'operator' | 'vendor';

export interface ReceiptSignature {
  algorithm: 'ed25519';
  key_id: string;
  public_key_fingerprint: string;
  signature: string;
  signed_at: string;
  signer_role: SignerRole;
}

export interface RegulatoryStateAnchor {
  hash: string | null;
  pending: boolean;
  snapshot_source: string | null;
  anchor_timestamp: string | null;
  anchor_method: 'pending' | 'rfc3161' | 'opentimestamps' | null;
}

export interface ComplianceReceiptDecision {
  effect: 'allow' | 'deny' | 'escalate';
  evaluation_path: 'temporal' | 'out_of_scope' | 'declared_scope' | 'no_match';
  matched_rule_id: string | null;
  reason_code: string;
  reason: string;
}

export interface ComplianceReceipt {
  receipt_version: '0.1';
  schema_version: '0.1';
  receipt_id: string;
  receipt_hash: string;
  previous_receipt_hash: string | null;
  canonical_form: 'rfc8785';

  issued_at: string;
  code_version: string;
  contract_id: string;
  contract_version: string;

  tenant_id: string;
  agent_id: string;
  evaluation_id: string;
  request_id: string;

  decision: ComplianceReceiptDecision;

  // Bubble 16 three-state (OPTIONAL, backward-compatible). Present only when the
  // decision is a block pending human review (a composite returned 'review' and
  // none returned 'fail'). Absent ⇒ false. Included in the signed body when
  // present, so verification round-trips; omitted otherwise, so every pre-Bubble-16
  // receipt remains byte-identical.
  review_required?: boolean;
  review_reason?: string;

  predicate_evaluations: PredicateEvaluation[];
  composite_evaluations: CompositePredicateEvaluation[];

  regulatory_state: RegulatoryStateAnchor;
  signatures: ReceiptSignature[];

  // RFC 3161 external timestamp anchor (Bubble 11). Attached AFTER signing and
  // receipt_hash computation; NOT part of the signed body or the receipt_hash.
  // null/absent ⇒ not externally timestamped (TSA unreachable, or pre-Bubble-11).
  timestamp_token?: TimestampToken | null;
}

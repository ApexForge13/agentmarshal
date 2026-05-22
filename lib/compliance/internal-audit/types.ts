// InternalAuditRecord v0.1 types — TS mirror of spec/v0.1/internal-audit-record.schema.json.
// The JSON Schema is the normative source; this file MUST stay structurally aligned.
//
// Signatures, regulatory anchor, predicate evaluation, and composite evaluation
// shapes are byte-identical with Compliance Receipts and are re-imported from
// lib/compliance/receipt/types to keep the crypto substrate single-source.

import type { PredicateEvaluation } from '@/types/authzen';
import type { CompositePredicateEvaluation } from '@/lib/authzen/composite-dispatch';
import type {
  ReceiptSignature,
  RegulatoryStateAnchor,
  SignerRole,
} from '@/lib/compliance/receipt/types';

export type AuditRecordSignature = ReceiptSignature;
export type { RegulatoryStateAnchor, SignerRole };

export type AgentType =
  | 'LeadScraper'
  | 'Validator'
  | 'InboxAllocator'
  | 'Personalizer'
  | 'CampaignManager'
  | 'ResponseHandler'
  | 'COO'
  | 'InboxProvisioner'
  | 'Voice'
  | 'RegulatoryMonitor';

export interface InternalAuditAgent {
  id: string;
  type: AgentType;
  version: string;
}

export interface InternalAuditAction {
  type: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export interface InternalAuditContract {
  id: string;
  version: string;
}

export interface InternalAuditDecision {
  effect: 'allow' | 'deny' | 'escalate';
  evaluation_path: 'temporal' | 'out_of_scope' | 'declared_scope' | 'no_match';
  matched_rule_id: string | null;
  reason_code: string;
  reason: string;
}

export interface InternalAuditEvaluation {
  predicate_evaluations: PredicateEvaluation[];
  composite_evaluations: CompositePredicateEvaluation[];
  decision: InternalAuditDecision;
}

export interface InternalAuditRecord {
  internal_audit_version: '0.1';
  schema_version: '0.1';
  record_type: 'internal_audit';
  record_id: string;
  audit_hash: string;
  previous_audit_hash: string | null;
  canonical_form: 'rfc8785';

  issued_at: string;
  code_version: string;

  tenant_id: string;
  evaluation_id: string;
  request_id: string;

  agent: InternalAuditAgent;
  action: InternalAuditAction;
  contract: InternalAuditContract;
  evaluation: InternalAuditEvaluation;

  regulatory_state: RegulatoryStateAnchor;
  signatures: AuditRecordSignature[];
}

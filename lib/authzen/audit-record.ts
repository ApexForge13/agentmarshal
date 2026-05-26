// AuditRecord type matching spec/v0.1/audit-record.schema.json.
// Used as the contract for AuditEmitter.emit() in EvalContext.
// composite_evaluations is added here as an additive field; full schema alignment lands later.

import type { PredicateEvaluation } from '@/types/authzen';

export interface AuditRecord {
  audit_record_version: '0.1';
  evaluation_id: string;
  tenant_id?: string;
  agent_id: string;
  contract_id: string;
  contract_version: number;
  evaluated_at: string;
  request: { subject: object; action: object; resource: object; context?: object };
  response: { decision: boolean; context?: object };
  decision: 'allow' | 'deny' | 'escalate';
  evaluation_path: 'temporal' | 'out_of_scope' | 'declared_scope' | 'no_match';
  matched_rule_id?: string | null;
  out_of_scope_term?: string | object | null;
  reason_code: string;
  reason?: string;
  // Bubble 16 three-state (optional, backward-compatible): set when the decision
  // is a block pending human review rather than a hard deny.
  review_required?: boolean;
  review_reason?: string;
  predicate_evaluations?: PredicateEvaluation[];
  composite_evaluations?: unknown[];
  escalation_ticket_id?: string | null;
  output_hash?: string;
  request_id?: string;
  logged_at: string;
  provenance?: null;
  extensions?: Record<string, unknown>;
}

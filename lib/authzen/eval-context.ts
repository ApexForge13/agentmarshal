// EvalContext: richer context passed to composite predicates.
// Day 3 base predicates continue to receive PredicateContext (just `now`).
// Composites receive EvalContext, which the evaluator constructs from the AuthZEN request.

import type { AuditRecord } from './audit-record';
import type { BDCallAudit } from '@/types/authzen';

export interface AuditEmitter {
  emit(record: Partial<AuditRecord>): Promise<void>;
}

export interface EvalContext {
  now: Date;
  tenant_id: string;
  agent_id: string;
  request_id: string;
  audit: AuditEmitter;
  /**
   * Live action.properties from the AuthZEN request being evaluated.
   * Composite predicates whose pass/fail depends on runtime state the
   * Scope Contract cannot know at issuance time (e.g. mid-call consent
   * status) read it from here. The contract's static composite_checks[].input
   * still carries issuance-time parameters; this carries request-time state.
   * Bubble 9 (voice): voice_recording_consent_state_resolved reads
   * `consent_status` from here. Optional — composites must tolerate absence.
   */
  action_properties?: Record<string, unknown>;
  /**
   * Bubble 17: the request's subject identity (subject.id + subject.type), so a
   * composite that reaches out through the MCP proxy can resolve the agent's Scope
   * Contract by the same id/type the evaluator did. Optional — composites tolerate absence.
   */
  subject?: { id: string; type: string };
  /**
   * Bubble 17: mutable sink for Bright Data call audit entries produced during
   * evaluation (e.g. by entity_adverse_media_check_v0, which calls the MCP proxy).
   * The evaluator creates the array and surfaces it on EvaluationResult.bd_calls;
   * composites push to it. Optional — composites tolerate absence.
   */
  bd_calls?: BDCallAudit[];
}

/** No-op emitter for tests and for evaluator paths that don't persist mid-evaluation. */
export const NULL_EMITTER: AuditEmitter = {
  async emit(): Promise<void> {
    /* no-op */
  },
};

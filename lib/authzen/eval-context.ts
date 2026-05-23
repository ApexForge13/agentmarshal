// EvalContext: richer context passed to composite predicates.
// Day 3 base predicates continue to receive PredicateContext (just `now`).
// Composites receive EvalContext, which the evaluator constructs from the AuthZEN request.

import type { AuditRecord } from './audit-record';

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
}

/** No-op emitter for tests and for evaluator paths that don't persist mid-evaluation. */
export const NULL_EMITTER: AuditEmitter = {
  async emit(): Promise<void> {
    /* no-op */
  },
};

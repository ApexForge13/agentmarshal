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
}

/** No-op emitter for tests and for evaluator paths that don't persist mid-evaluation. */
export const NULL_EMITTER: AuditEmitter = {
  async emit(): Promise<void> {
    /* no-op */
  },
};

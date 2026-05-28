// Pure, client-safe helpers that derive the dashboard's display shape (FeedEntry) from
// a persisted signed record. The live feed builds a FeedEntry from the request it sent
// (lib/dashboard/feed.ts makeFeedEntry); persisted fixtures only carry the record, so we
// read the same display fields back out of the signed body. Internal Audit records nest
// the decision under `evaluation`; Compliance Receipts keep it at the top — we read both
// so this stays record-type agnostic. No React, no fs: importable anywhere.

import {
  extractComposites,
  compositeSummary,
  type SignedRecord,
  type FeedEntry,
  type FeedDecision,
} from './feed';
import type { BDCallAudit } from '@/types/authzen';

export interface ReceiptComposite {
  predicate: string;
  result: string; // 'pass' | 'fail' | 'stub' | 'review'
  reason?: string;
  details?: Record<string, unknown>;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function decisionBlock(record: SignedRecord): Record<string, unknown> | null {
  const evalBlock = asObject(record['evaluation']);
  if (evalBlock) {
    const d = asObject(evalBlock['decision']);
    if (d) return d;
  }
  return asObject(record['decision']);
}

function actionBlock(record: SignedRecord): Record<string, unknown> | null {
  return asObject(record['action']);
}

function recordId(record: SignedRecord): string {
  return (
    asString(record['record_id']) ??
    asString(record['receipt_id']) ??
    asString(record['audit_hash']) ??
    asString(record['receipt_hash']) ??
    `rec-${Math.random().toString(36).slice(2)}`
  );
}

/** permit | review | deny from the signed body, with review_required taking precedence. */
export function recordDecision(record: SignedRecord): { decision: FeedDecision; reviewReason: string | null } {
  if (record['review_required'] === true) {
    return { decision: 'review', reviewReason: asString(record['review_reason']) };
  }
  const effect = asString(decisionBlock(record)?.['effect']);
  if (effect === 'allow' || effect === 'permit') return { decision: 'permit', reviewReason: null };
  if (effect === 'escalate') return { decision: 'review', reviewReason: null };
  return { decision: 'deny', reviewReason: null };
}

/** Display agent label: the original subject.type (preserved in action.inputs when the
 *  PDP mapped an out-of-enum type to the COO fallback), else the record's agent.type. */
export function recordAgentLabel(record: SignedRecord): string {
  const inputs = asObject(actionBlock(record)?.['inputs']);
  const original = asString(inputs?.['_unrecognized_subject_type']);
  if (original) return original;
  const agent = asObject(record['agent']);
  return asString(agent?.['type']) ?? asString(record['agent_id']) ?? 'agent';
}

function recordAgentId(record: SignedRecord): string {
  const agent = asObject(record['agent']);
  return asString(agent?.['id']) ?? asString(record['agent_id']) ?? '';
}

function recordActionName(record: SignedRecord): string {
  return asString(actionBlock(record)?.['type']) ?? '';
}

function recordEntityId(record: SignedRecord): string | null {
  const inputs = asObject(actionBlock(record)?.['inputs']);
  const entity = asObject(inputs?.['entity']);
  return asString(entity?.['id']);
}

/** Build the dashboard FeedEntry display shape from a persisted signed record. */
export function makeFeedEntryFromRecord(record: SignedRecord): FeedEntry {
  const { decision, reviewReason } = recordDecision(record);
  return {
    id: recordId(record),
    issuedAt: asString(record['issued_at']) ?? new Date().toISOString(),
    agentType: recordAgentLabel(record),
    agentId: recordAgentId(record),
    actionName: recordActionName(record),
    entityId: recordEntityId(record),
    decision,
    reviewReason,
    compositeSummary: compositeSummary(extractComposites(record)),
    record,
  };
}

/** Composite evaluations, record-type agnostic (top-level or nested under evaluation). */
export function receiptComposites(record: SignedRecord): ReceiptComposite[] {
  return extractComposites(record) as ReceiptComposite[];
}

/** Worst composite result for a compact list badge: fail > review > stub > pass. */
export function compositeVerdict(record: SignedRecord): 'pass' | 'review' | 'fail' | 'stub' | null {
  const results = receiptComposites(record).map((c) => c.result);
  if (results.length === 0) return null;
  if (results.includes('fail')) return 'fail';
  if (results.includes('review')) return 'review';
  if (results.includes('stub')) return 'stub';
  return 'pass';
}

/** The governed BD calls on the signed body (Bubble 17), or [] when none. */
export function recordBdCalls(record: SignedRecord): BDCallAudit[] {
  const calls = record['bd_calls'];
  return Array.isArray(calls) ? (calls as BDCallAudit[]) : [];
}

/** The previous record's hash if this record is chained (Internal Audit or Receipt). */
export function previousHash(record: SignedRecord): string | null {
  return asString(record['previous_audit_hash']) ?? asString(record['previous_receipt_hash']);
}

/** This record's own chain hash. */
export function recordHash(record: SignedRecord): string | null {
  return asString(record['audit_hash']) ?? asString(record['receipt_hash']);
}

/** The human-facing target of a governed BD call: URL, else search query, else tool. */
export function bdCallTarget(call: BDCallAudit): string | null {
  const p = (call.parameters ?? {}) as Record<string, unknown>;
  return asString(p['url']) ?? asString(p['query']) ?? asString(p['bd_tool_name']) ?? null;
}

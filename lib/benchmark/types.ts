// Type definitions for the adversarial-pattern benchmark suite (Bubble 8b).
// 20 scenarios across 5 governance categories run against 3 evaluation tracks.

import type { AuthZenRequest, ScopeContract } from '@/types/authzen';

export type BenchmarkCategory =
  | 'cross_tenant_isolation'
  | 'action_scope'
  | 'spend_cap'
  | 'role_boundary'
  | 'prompt_injection'
  // Bubble 12: the audit-evidence layer (signed receipts, hash chains, RFC 3161
  // anchors, engine-independent verification). Dispatched through a separate
  // verification path, not the structural-authz tracks.
  | 'audit_trail';

export type ExpectedOutcome = 'deny' | 'permit';
// audit_trail scenarios assert the verifier's behavior: 'catch' ⇒ the tamper is
// rejected (verified:false / chain invalid); 'permit' ⇒ a legitimate receipt verifies.
export type AuditTrailExpected = 'catch' | 'permit';
export type TrackId = 'A' | 'B' | 'C';

/**
 * Target of an audit_trail scenario: a Receipt/InternalAudit envelope (or a sequence
 * of them) the verifier is run against, instead of an AuthZEN request. The receipt
 * JSON is inlined verbatim (loadScenarios does not resolve references).
 */
export type AuditTrailTarget =
  | { kind: 'single'; receipt: Record<string, unknown> }
  | { kind: 'chain'; receipts: Record<string, unknown>[] };

/**
 * A single benchmark scenario loaded from data/benchmark/scenarios/*.json.
 * `contract` is INLINE per scenario because composite predicate inputs are
 * contract-baked (no expression language to template from request at
 * runtime); each scenario supplies the contract whose composite_checks
 * exercise the relevant governance composite with scenario-specific input.
 * Track C injects this contract via setContractOverride() before invoking
 * the POST handler. Track A and Track B ignore it.
 */
export interface BenchmarkScenario {
  id: string;
  category: BenchmarkCategory;
  adversarial: boolean;
  description: string;
  // Structural-authz scenarios (the 20 existing) carry request + contract.
  request?: AuthZenRequest;
  contract?: ScopeContract;
  // audit_trail scenarios carry a verification target instead.
  target?: AuditTrailTarget;
  expected: ExpectedOutcome | AuditTrailExpected;
}

export interface TrackResult {
  scenario_id: string;
  track: TrackId;
  decision: ExpectedOutcome;
  matched_expected: boolean;
  reason?: string;
}

export interface BenchmarkResult {
  generated_at: string;
  commit_sha: string;
  // Counts cover the STRUCTURAL-authz scenarios only (the existing 20), so the
  // Section-1 numbers are unchanged by adding audit_trail scenarios.
  total_scenarios: number;
  adversarial_count: number;
  legitimate_count: number;
  per_track: Record<TrackId, TrackAggregate>;
  per_category: Array<CategoryAggregate>;
  per_scenario: Array<PerScenarioRow>;
  // Bubble 12 Section 2. Present only when audit_trail scenarios were run.
  audit_trail?: AuditTrailAggregate;
}

/** One audit_trail scenario's verdict from the AgentMarshal verifier (Track C). */
export interface AuditTrailScenarioResult {
  id: string;
  description: string;
  adversarial: boolean;
  expected: AuditTrailExpected;
  /** Verifier decision normalized to the benchmark vocabulary: 'deny' ⇒ tamper caught. */
  decision: ExpectedOutcome;
  matched_expected: boolean;
  reason: string;
}

export interface AuditTrailAggregate {
  total: number;
  /** Scenarios where AgentMarshal produced the expected verdict (target: 5/5). */
  agentmarshal_caught: number;
  results: AuditTrailScenarioResult[];
}

export interface TrackAggregate {
  caught_adversarial: number;
  total_adversarial: number;
  false_positives: number;
  total_legitimate: number;
  net_score: number;
}

export interface CategoryAggregate {
  category: BenchmarkCategory;
  caught_by_track: Record<TrackId, number>;
  total_adversarial: number;
}

export interface PerScenarioRow {
  id: string;
  category: BenchmarkCategory;
  adversarial: boolean;
  expected: ExpectedOutcome;
  track_a: ExpectedOutcome;
  track_b: ExpectedOutcome;
  track_c: ExpectedOutcome;
  c_matched: boolean;
}

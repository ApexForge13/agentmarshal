// Type definitions for the adversarial-pattern benchmark suite (Bubble 8b).
// 20 scenarios across 5 governance categories run against 3 evaluation tracks.

import type { AuthZenRequest, ScopeContract } from '@/types/authzen';

export type BenchmarkCategory =
  | 'cross_tenant_isolation'
  | 'action_scope'
  | 'spend_cap'
  | 'role_boundary'
  | 'prompt_injection';

export type ExpectedOutcome = 'deny' | 'permit';
export type TrackId = 'A' | 'B' | 'C';

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
  request: AuthZenRequest;
  contract: ScopeContract;
  expected: ExpectedOutcome;
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
  total_scenarios: number;
  adversarial_count: number;
  legitimate_count: number;
  per_track: Record<TrackId, TrackAggregate>;
  per_category: Array<CategoryAggregate>;
  per_scenario: Array<PerScenarioRow>;
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

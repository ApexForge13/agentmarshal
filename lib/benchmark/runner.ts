// Benchmark runner. Loads scenarios from disk, runs all three evaluation
// tracks against each, and aggregates structured results. The CLI entry
// (scripts/run-benchmark.ts) and the integration test
// (tests/benchmark/runner.test.ts) both consume this runner.

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { evaluateTrackA } from './evaluators/track-a';
import { evaluateTrackB } from './evaluators/track-b';
import { evaluateTrackC } from './evaluators/track-c';
import { evaluateTrackCAuditTrail } from './evaluators/track-c-audit-trail';
import type {
  AuditTrailAggregate,
  AuditTrailExpected,
  AuditTrailScenarioResult,
  BenchmarkCategory,
  BenchmarkResult,
  BenchmarkScenario,
  CategoryAggregate,
  ExpectedOutcome,
  PerScenarioRow,
  TrackAggregate,
  TrackId,
  TrackResult,
} from './types';

const SCENARIOS_DIR = path.resolve(process.cwd(), 'data', 'benchmark', 'scenarios');

const CATEGORIES: BenchmarkCategory[] = [
  'cross_tenant_isolation',
  'action_scope',
  'spend_cap',
  'role_boundary',
  'prompt_injection',
];

export async function loadScenarios(): Promise<BenchmarkScenario[]> {
  const entries = await fs.readdir(SCENARIOS_DIR);
  const files = entries.filter((e) => e.endsWith('.json')).sort();
  const scenarios: BenchmarkScenario[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(SCENARIOS_DIR, file), 'utf-8');
    scenarios.push(JSON.parse(raw) as BenchmarkScenario);
  }
  return scenarios;
}

function resolveCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export async function runBenchmark(scenarios?: BenchmarkScenario[]): Promise<BenchmarkResult> {
  const all = scenarios ?? (await loadScenarios());
  // Dispatch by category. Structural-authz scenarios (Section 1) run through tracks
  // A/B/C exactly as before; audit_trail scenarios (Section 2) run through the
  // engine-independent verifier path. Keeping `list` = structural preserves every
  // Section-1 aggregate (total/per-track/per-category/per-scenario) unchanged.
  const list = all.filter((s) => s.category !== 'audit_trail');
  const auditTrailScenarios = all.filter((s) => s.category === 'audit_trail');

  const allResults: TrackResult[] = [];
  for (const scenario of list) {
    allResults.push(evaluateTrackA(scenario));
    allResults.push(evaluateTrackB(scenario));
    allResults.push(await evaluateTrackC(scenario));
  }

  const adversarial = list.filter((s) => s.adversarial);
  const legitimate = list.filter((s) => !s.adversarial);

  const perTrack: Record<TrackId, TrackAggregate> = {
    A: aggregateTrack('A', list, allResults),
    B: aggregateTrack('B', list, allResults),
    C: aggregateTrack('C', list, allResults),
  };

  const perCategory: CategoryAggregate[] = CATEGORIES.map((category) => {
    const inCat = list.filter((s) => s.category === category && s.adversarial);
    return {
      category,
      total_adversarial: inCat.length,
      caught_by_track: {
        A: caughtCount('A', inCat, allResults),
        B: caughtCount('B', inCat, allResults),
        C: caughtCount('C', inCat, allResults),
      },
    };
  });

  const perScenario: PerScenarioRow[] = list.map((s) => {
    const a = resultFor('A', s.id, allResults);
    const b = resultFor('B', s.id, allResults);
    const c = resultFor('C', s.id, allResults);
    return {
      id: s.id,
      category: s.category,
      adversarial: s.adversarial,
      // `list` is structural-only, so expected is always 'deny' | 'permit' here.
      expected: s.expected as ExpectedOutcome,
      track_a: a.decision,
      track_b: b.decision,
      track_c: c.decision,
      c_matched: c.matched_expected,
    };
  });

  // Section 2 — audit-trail tampering. Each scenario runs through the verifier (Track C
  // only; Cedar/OPA have no equivalent artifact, surfaced in the report).
  const auditResults: AuditTrailScenarioResult[] = [];
  for (const s of auditTrailScenarios) {
    const r = await evaluateTrackCAuditTrail(s);
    auditResults.push({
      id: s.id,
      description: s.description,
      adversarial: s.adversarial,
      expected: s.expected as AuditTrailExpected,
      decision: r.decision,
      matched_expected: r.matched_expected,
      reason: r.reason ?? '',
    });
  }
  const audit_trail: AuditTrailAggregate | undefined = auditTrailScenarios.length
    ? {
        total: auditTrailScenarios.length,
        agentmarshal_caught: auditResults.filter((r) => r.matched_expected).length,
        results: auditResults,
      }
    : undefined;

  return {
    generated_at: new Date().toISOString(),
    commit_sha: resolveCommitSha(),
    total_scenarios: list.length,
    adversarial_count: adversarial.length,
    legitimate_count: legitimate.length,
    per_track: perTrack,
    per_category: perCategory,
    per_scenario: perScenario,
    audit_trail,
  };
}

function resultFor(track: TrackId, scenarioId: string, all: TrackResult[]): TrackResult {
  const found = all.find((r) => r.track === track && r.scenario_id === scenarioId);
  if (!found) {
    throw new Error(`benchmark runner: no result for track=${track} scenario=${scenarioId}`);
  }
  return found;
}

function caughtCount(track: TrackId, adversarial: BenchmarkScenario[], all: TrackResult[]): number {
  let caught = 0;
  for (const s of adversarial) {
    const r = resultFor(track, s.id, all);
    if (r.decision === 'deny') caught += 1;
  }
  return caught;
}

function aggregateTrack(
  track: TrackId,
  list: BenchmarkScenario[],
  all: TrackResult[],
): TrackAggregate {
  const adversarial = list.filter((s) => s.adversarial);
  const legitimate = list.filter((s) => !s.adversarial);

  let caught = 0;
  for (const s of adversarial) {
    if (resultFor(track, s.id, all).decision === 'deny') caught += 1;
  }
  let fp = 0;
  for (const s of legitimate) {
    if (resultFor(track, s.id, all).decision === 'deny') fp += 1;
  }
  return {
    caught_adversarial: caught,
    total_adversarial: adversarial.length,
    false_positives: fp,
    total_legitimate: legitimate.length,
    net_score: caught - fp,
  };
}

export type { ExpectedOutcome };

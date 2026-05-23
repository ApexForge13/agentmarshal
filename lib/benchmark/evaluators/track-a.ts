// Track A: no-governance baseline. Always permits, ignoring the request.
// Establishes the "what happens without AgentMarshal" baseline for the
// benchmark — every adversarial scenario goes through, every legitimate
// one goes through. Catch rate is 0, false positives are 0.

import type { BenchmarkScenario, TrackResult } from '../types';

export function evaluateTrackA(scenario: BenchmarkScenario): TrackResult {
  return {
    scenario_id: scenario.id,
    track: 'A',
    decision: 'permit',
    matched_expected: scenario.expected === 'permit',
    reason: 'no-governance baseline: always permit',
  };
}

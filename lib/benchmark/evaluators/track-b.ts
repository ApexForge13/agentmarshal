// Track B: naive validation. Three sequential checks; any failure → deny.
// Modeled on what a hand-rolled validator might do without governance
// infrastructure: schema-shape sanity, a blocklist of obvious adversarial
// substrings, and a hardcoded "dangerous action" list requiring confirm.
// Intentionally naive: e.g., the blocklist does NOT include "ignore
// previous instructions" — Track B's whole point is that ad-hoc filters
// miss whole categories of failure.

import type { BenchmarkScenario, TrackResult } from '../types';

const KNOWN_AGENT_TYPES = new Set<string>([
  'LeadScraper',
  'Validator',
  'InboxAllocator',
  'Personalizer',
  'CampaignManager',
  'ResponseHandler',
  'COO',
  'InboxProvisioner',
  'Voice',
  'RegulatoryMonitor',
]);

const BLOCKLIST_PATTERNS: RegExp[] = [
  /DROP\s+TABLE/i,
  /rm\s+-rf/i,
  /<script/i,
  /\.\.\/\.\./,
];

const DANGEROUS_ACTIONS = new Set<string>(['drop_table', 'delete_all']);

export function evaluateTrackB(scenario: BenchmarkScenario): TrackResult {
  const req = scenario.request as unknown as Record<string, unknown>;

  // (1) JSON schema sanity: required fields + agent_type membership.
  const subject = req.subject as Record<string, unknown> | undefined;
  const action = req.action as Record<string, unknown> | undefined;
  const resource = req.resource as Record<string, unknown> | undefined;
  if (!subject || !action || !resource) {
    return mkDeny(scenario, 'missing required field (subject/action/resource)');
  }
  if (typeof subject.id !== 'string' || typeof (action.name) !== 'string' || typeof resource.id !== 'string') {
    return mkDeny(scenario, 'required field has wrong type');
  }
  if (typeof subject.type !== 'string' || !KNOWN_AGENT_TYPES.has(subject.type as string)) {
    return mkDeny(scenario, `unknown agent_type '${subject.type}'`);
  }

  // (2) Regex blocklist over JSON.stringify(payload).
  const serialized = JSON.stringify(scenario.request);
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(serialized)) {
      return mkDeny(scenario, `blocklist match: ${pattern}`);
    }
  }

  // (3) Hardcoded dangerous-actions list requires context.confirm:true.
  if (DANGEROUS_ACTIONS.has(action.name as string)) {
    const context = (req.context ?? {}) as Record<string, unknown>;
    if (context.confirm !== true) {
      return mkDeny(scenario, `dangerous action '${action.name}' requires confirm:true`);
    }
  }

  return {
    scenario_id: scenario.id,
    track: 'B',
    decision: 'permit',
    matched_expected: scenario.expected === 'permit',
    reason: 'naive validator: all three checks passed',
  };
}

function mkDeny(scenario: BenchmarkScenario, reason: string): TrackResult {
  return {
    scenario_id: scenario.id,
    track: 'B',
    decision: 'deny',
    matched_expected: scenario.expected === 'deny',
    reason,
  };
}

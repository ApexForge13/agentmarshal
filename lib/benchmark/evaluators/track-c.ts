// Track C: AgentMarshal. Invokes the real /api/access/v1/evaluation POST
// handler in-process, after injecting the scenario's inline contract via
// setContractOverride() (Bubble 7 + 8b additions). Composite dispatch,
// signed Compliance Receipt / Internal Audit emission, AuthZEN audit-row
// persistence — all happen as a byproduct of the request.

import { POST } from '@/app/api/access/v1/evaluation/route';
import {
  setContractOverride,
  clearContractOverrides,
} from '@/lib/authzen/contracts';
import type { BenchmarkScenario, TrackResult } from '../types';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function evaluateTrackC(scenario: BenchmarkScenario): Promise<TrackResult> {
  // The runner only routes structural-authz scenarios here; audit_trail goes through
  // track-c-audit-trail. Guard so the optional request/contract narrow for TS.
  if (!scenario.request || !scenario.contract) {
    throw new Error(`evaluateTrackC: scenario ${scenario.id} is missing request/contract`);
  }
  setContractOverride(scenario.request.subject.id, scenario.contract);
  try {
    const response = await POST(makeRequest(scenario.request));
    const body = (await response.json()) as Record<string, unknown>;
    const decision: 'permit' | 'deny' = body.decision === true ? 'permit' : 'deny';
    const ctx = (body.context ?? {}) as Record<string, unknown>;
    return {
      scenario_id: scenario.id,
      track: 'C',
      decision,
      matched_expected: decision === scenario.expected,
      reason: typeof ctx.reason === 'string' ? ctx.reason : undefined,
    };
  } finally {
    clearContractOverrides();
  }
}

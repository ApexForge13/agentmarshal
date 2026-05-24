// Track C for the audit-trail category (Bubble 12). Where the structural-authz Track C
// invokes the evaluation endpoint, this runs the engine-INDEPENDENT verifiers against a
// receipt (or receipt sequence) — exactly what a regulator does with only the receipt
// JSON and the published public key, no AgentMarshal access. Single targets go through
// verifyReceipt (signature + RFC 3161 timestamp + issued_at cross-check); chain targets
// go through verifyChain (hash-linkage). Returns the same TrackResult shape as Track C
// so the runner aggregates it uniformly.

import { verifyReceipt } from '@/lib/verify/verify-receipt';
import { verifyChain } from '@/lib/verify/verify-chain';
import type { BenchmarkScenario, ExpectedOutcome, TrackResult } from '../types';

export async function evaluateTrackCAuditTrail(
  scenario: BenchmarkScenario,
): Promise<TrackResult> {
  const target = scenario.target;
  if (!target) {
    throw new Error(`audit-trail evaluator: scenario ${scenario.id} has no target`);
  }

  let verified: boolean;
  let reason: string;
  if (target.kind === 'single') {
    const r = await verifyReceipt(target.receipt);
    verified = r.verified;
    reason = r.reason;
  } else {
    const r = verifyChain(target.receipts);
    verified = r.valid;
    reason = r.valid
      ? (r.reason ?? 'chain intact')
      : `chain break at index ${r.break_at}: ${r.reason}`;
  }

  // Normalize to the benchmark vocabulary: a rejected tamper is a 'deny', a verified
  // receipt is a 'permit'. 'catch' (expected) is met by 'deny'; 'permit' by 'permit'.
  const decision: ExpectedOutcome = verified ? 'permit' : 'deny';
  const matched =
    (scenario.expected === 'catch' && decision === 'deny') ||
    (scenario.expected === 'permit' && decision === 'permit');

  return {
    scenario_id: scenario.id,
    track: 'C',
    decision,
    matched_expected: matched,
    reason,
  };
}

// Crown-jewel integration test (Bubble 14, Phases 0 + 6).
//
// Fires the four demo scenarios through the REAL /api/access/v1/evaluation POST
// handler in-process — exactly as the dashboard "Run demo sequence" does — with
// NO setContractOverride. This proves the production path end-to-end:
//   subject.id misses the agent-contract map → subject.type fallback resolves
//   trading_v1 → entity_not_sanctioned composite runs → genuine signed record.
//
// If Phase 0's resolver were absent, subject.id (trading-agent-001, …) would miss
// and fall to STUB_PERMISSIVE_ALLOW, which permits ANY present subject.id — the
// hero would PERMIT. The deny on the hero + contract.id === 'trading_v1' together
// are the assertion that the resolver and the composite both fired.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { POST } from '../../app/api/access/v1/evaluation/route';
import { loadDemoScenarios } from '@/lib/dashboard/demo-scenarios';
import { clearContractCache } from '@/lib/authzen/contracts';
import { init as initAudit, reset as resetAudit } from '../../lib/authzen/audit';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('trading-desk demo sequence — production resolver path (Bubble 14)', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDbPath = path.join(os.tmpdir(), `bubble14-demo-${randomUUID()}.db`);
    initAudit(tmpDbPath);
    clearContractCache();
  });

  afterEach(() => {
    resetAudit();
    clearContractCache();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('resolves all four trading agents by subject.type and yields permit, permit, permit, deny', async () => {
    const scenarios = loadDemoScenarios();
    const results: Array<{ decision: 'permit' | 'deny'; contractId: unknown; recordType: unknown }> =
      [];

    for (const scenario of scenarios) {
      const response = await POST(makeRequest(scenario.request));
      expect(response.status).toBe(200);
      const body = await response.json();

      // A genuine signed record rode back on the response.
      expect(body.record).toBeDefined();
      expect(body.record.signatures).toHaveLength(1);

      // Trading agents are outside the customer-touching set → Internal Audit.
      // The contract id proves the subject.type fallback resolved trading_v1
      // rather than collapsing to the permissive stub.
      results.push({
        decision: body.decision === true ? 'permit' : 'deny',
        contractId: body.record.contract?.id,
        recordType: body.record.record_type,
      });
    }

    expect(results.map((r) => r.decision)).toEqual(['permit', 'permit', 'permit', 'deny']);
    expect(results.map((r) => r.contractId)).toEqual([
      'trading_v1',
      'trading_v1',
      'trading_v1',
      'trading_v1',
    ]);
    expect(results.map((r) => r.recordType)).toEqual([
      'internal_audit',
      'internal_audit',
      'internal_audit',
      'internal_audit',
    ]);
  });

  it('the hero deny captures the OFAC-sanctioned counterparty in its composite trace', async () => {
    const scenarios = loadDemoScenarios();
    const hero = scenarios[scenarios.length - 1];
    expect(hero.request.subject.type).toBe('ExecutionAgent');

    const response = await POST(makeRequest(hero.request));
    const body = await response.json();

    expect(body.decision).toBe(false);
    const composites = body.record.evaluation.composite_evaluations;
    expect(composites).toHaveLength(1);
    expect(composites[0].predicate).toBe('entity_not_sanctioned');
    expect(composites[0].result).toBe('fail');
    expect(composites[0].details.matched_entry).toBe('SYN-SDN-IRAN-MARITIME-001');
  });
});

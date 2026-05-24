// Integration test for the audit-trail tampering suite (Bubble 12, Section 2). Loads
// every scenario through the runner, confirms the verifier (Track C) catches all five
// tampers with the right reasons, confirms the existing 20-scenario Section 1 is
// untouched, and confirms the report renders Section 2's capability matrix.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { runBenchmark } from '../../lib/benchmark/runner';
import { renderReport } from '../../lib/benchmark/report';
import { init as initAudit, reset as resetAudit } from '../../lib/authzen/audit';
import { clearContractCache, clearContractOverrides } from '../../lib/authzen/contracts';

describe('audit-trail tampering benchmark (Bubble 12 — Section 2)', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDbPath = path.join(os.tmpdir(), `authzen-audit-trail-${randomUUID()}.db`);
    initAudit(tmpDbPath);
    clearContractCache();
    clearContractOverrides();
  });

  afterEach(() => {
    resetAudit();
    clearContractOverrides();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('Track C catches all 5 audit-trail tampers with the right reasons', async () => {
    const result = await runBenchmark();
    expect(result.audit_trail).toBeDefined();
    const audit = result.audit_trail!;
    expect(audit.total).toBe(5);
    expect(audit.agentmarshal_caught).toBe(5);

    const byId = new Map(audit.results.map((r) => [r.id, r]));

    const a1 = byId.get('audit_trail-01-adv-tampered-receipt')!;
    expect(a1.decision).toBe('deny');
    expect(a1.reason).toMatch(/signature mismatch/i);

    const a2 = byId.get('audit_trail-02-adv-broken-chain')!;
    expect(a2.decision).toBe('deny');
    expect(a2.reason).toMatch(/break at index 1/i);

    const a3 = byId.get('audit_trail-03-adv-backdated-receipt')!;
    expect(a3.decision).toBe('deny');
    expect(a3.reason).toMatch(/predates external timestamp/i);

    const a4 = byId.get('audit_trail-04-adv-forged-signature')!;
    expect(a4.decision).toBe('deny');
    expect(a4.reason).toMatch(/different key/i);

    const a5 = byId.get('audit_trail-05-legit-offline-verification')!;
    expect(a5.decision).toBe('permit');
    expect(a5.matched_expected).toBe(true);
  });

  it('leaves the existing 20-scenario Section 1 aggregates unchanged', async () => {
    const result = await runBenchmark();
    expect(result.total_scenarios).toBe(20);
    expect(result.adversarial_count).toBe(15);
    expect(result.legitimate_count).toBe(5);
    expect(result.per_track.C.false_positives).toBe(0);
    expect(result.per_track.A.caught_adversarial).toBe(0);
  });

  it('renders Section 2 with the AgentMarshal-vs-Cedar-vs-OPA capability matrix', async () => {
    const result = await runBenchmark();
    const md = renderReport(result);

    expect(md).toContain('## Section 2 — Audit-trail tampering (Bubble 12)');
    expect(md).toContain('| Scenario | AgentMarshal | Cedar | OPA |');
    expect(md).toContain('A1. Tampered receipt');
    expect(md).toContain('A5. Offline verification');
    expect(md).toContain('no equivalent capability');
    expect(md).toContain('**5/5**');
    expect(md).toContain('**0/5**');

    // Section 1 still present and unchanged in shape.
    expect(md).toContain('## Summary');
    expect(md).toContain('| Track | Adversarial Caught | False Positives | Net Score |');
  });
});

// Integration test for the adversarial-pattern benchmark suite (Bubble 8b).
// Loads all 24 structural scenarios from disk, runs all three tracks via the runner,
// asserts headline catch rates, and confirms reports/benchmark.md is
// generated with the expected summary header.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { runBenchmark } from '../../lib/benchmark/runner';
import { renderReport, writeReport, reportPath } from '../../lib/benchmark/report';
import { init as initAudit, reset as resetAudit } from '../../lib/authzen/audit';
import { clearContractCache, clearContractOverrides } from '../../lib/authzen/contracts';

describe('benchmark suite — adversarial-pattern catch rates (Bubble 8b)', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDbPath = path.join(os.tmpdir(), `authzen-bench-${randomUUID()}.db`);
    initAudit(tmpDbPath);
    clearContractCache();
    clearContractOverrides();
  });

  afterEach(() => {
    resetAudit();
    clearContractOverrides();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('runs 24 scenarios through 3 tracks and meets headline catch-rate thresholds', async () => {
    const result = await runBenchmark();

    expect(result.total_scenarios).toBe(24);
    expect(result.adversarial_count).toBe(16);
    expect(result.legitimate_count).toBe(8);

    const a = result.per_track.A;
    expect(a.caught_adversarial, 'Track A baseline should never catch').toBe(0);
    expect(a.false_positives, 'Track A baseline should never false-positive').toBe(0);

    const b = result.per_track.B;
    expect(b.caught_adversarial, 'Track B naive should catch at least 2 of 16').toBeGreaterThanOrEqual(2);
    expect(b.caught_adversarial, 'Track B naive should catch no more than 5 of 16').toBeLessThanOrEqual(5);
    expect(b.false_positives, 'Track B naive should not false-positive on the 8 legitimate scenarios').toBe(0);

    const c = result.per_track.C;
    expect(c.caught_adversarial, 'Track C AgentMarshal should catch at least 14 of 16').toBeGreaterThanOrEqual(14);
    expect(c.false_positives, 'Track C AgentMarshal should not false-positive on the 8 legitimate scenarios').toBe(0);

    const markdown = renderReport(result);
    await writeReport(markdown);

    expect(fs.existsSync(reportPath)).toBe(true);
    const written = fs.readFileSync(reportPath, 'utf-8');
    expect(written).toContain('# AgentMarshal benchmark');
    expect(written).toContain('| Track | Adversarial Caught | False Positives | Net Score |');

    // eslint-disable-next-line no-console
    console.log(
      `\nBenchmark summary: A=${a.caught_adversarial}/${a.total_adversarial} caught (${a.false_positives} FP), ` +
        `B=${b.caught_adversarial}/${b.total_adversarial} (${b.false_positives} FP), ` +
        `C=${c.caught_adversarial}/${c.total_adversarial} (${c.false_positives} FP). ` +
        `Report: ${reportPath}`,
    );
  });

  it('dispatches audit_trail scenarios through the verifier, leaving Section 1 at 24', async () => {
    const result = await runBenchmark();
    // The 24 structural scenarios stand alone and no audit_trail row leaks into them.
    expect(result.total_scenarios).toBe(24);
    expect(result.per_scenario).toHaveLength(24);
    expect(result.per_scenario.every((r) => r.category !== 'audit_trail')).toBe(true);
    // The 5 audit_trail scenarios ran through Track C's verifier path and all matched.
    expect(result.audit_trail?.total).toBe(5);
    expect(result.audit_trail?.agentmarshal_caught).toBe(5);
  });
});

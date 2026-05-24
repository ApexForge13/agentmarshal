// Renders a BenchmarkResult into the markdown report at reports/benchmark.md.
// Auto-generated; do NOT hand-author the .md.

import { promises as fs } from 'fs';
import path from 'path';
import type { AuditTrailAggregate, BenchmarkResult, TrackId } from './types';

const REPORT_PATH = path.resolve(process.cwd(), 'reports', 'benchmark.md');

// Section-2 row metadata: display label + the capability phrase shown when AgentMarshal
// produces the expected verdict. Ordered A1..A5.
const AUDIT_ROW_META: Array<{ id: string; label: string; capability: string }> = [
  { id: 'audit_trail-01-adv-tampered-receipt', label: 'A1. Tampered receipt', capability: 'signature mismatch' },
  { id: 'audit_trail-02-adv-broken-chain', label: 'A2. Broken hash chain', capability: 'chain verifier reports break at index 1' },
  { id: 'audit_trail-03-adv-backdated-receipt', label: 'A3. Backdated receipt', capability: 'issued_at predates TSA timestamp' },
  { id: 'audit_trail-04-adv-forged-signature', label: 'A4. Forged signature', capability: 'signed by a different key, fingerprint mismatch' },
  { id: 'audit_trail-05-legit-offline-verification', label: 'A5. Offline verification', capability: 'lib/verify standalone, no engine access' },
];

const NO_EQUIV = '— no equivalent capability¹';

export function renderReport(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push('# AgentMarshal benchmark — adversarial-pattern catch rates');
  lines.push('');
  lines.push(`- Generated: ${result.generated_at}`);
  lines.push(`- Commit: \`${result.commit_sha}\``);
  lines.push(`- Total scenarios: ${result.total_scenarios} (${result.adversarial_count} adversarial, ${result.legitimate_count} legitimate)`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Track | Adversarial Caught | False Positives | Net Score |');
  lines.push('|---|---|---|---|');
  for (const track of ['A', 'B', 'C'] as TrackId[]) {
    const agg = result.per_track[track];
    lines.push(
      `| ${trackLabel(track)} | ${agg.caught_adversarial}/${agg.total_adversarial} | ${agg.false_positives}/${agg.total_legitimate} | ${agg.net_score} |`,
    );
  }
  lines.push('');
  lines.push('## Per-category adversarial catches');
  lines.push('');
  lines.push('| Category | A | B | C |');
  lines.push('|---|---|---|---|');
  for (const cat of result.per_category) {
    lines.push(
      `| ${cat.category} | ${cat.caught_by_track.A}/${cat.total_adversarial} | ${cat.caught_by_track.B}/${cat.total_adversarial} | ${cat.caught_by_track.C}/${cat.total_adversarial} |`,
    );
  }
  lines.push('');
  lines.push('## Per-scenario detail');
  lines.push('');
  lines.push('| ID | Category | Adv? | Expected | A | B | C | C match? |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const row of result.per_scenario) {
    lines.push(
      `| ${row.id} | ${row.category} | ${row.adversarial ? 'yes' : 'no'} | ${row.expected} | ${row.track_a} | ${row.track_b} | ${row.track_c} | ${row.c_matched ? '✓' : '✗'} |`,
    );
  }
  lines.push('');

  if (result.audit_trail) {
    lines.push(...renderAuditTrailSection(result.audit_trail));
  }

  lines.push('## Reproduce');
  lines.push('');
  lines.push('```sh');
  lines.push('pnpm benchmark');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function renderAuditTrailSection(audit: AuditTrailAggregate): string[] {
  const byId = new Map(audit.results.map((r) => [r.id, r]));
  const lines: string[] = [];
  lines.push('## Section 2 — Audit-trail tampering (Bubble 12)');
  lines.push('');
  lines.push(
    'Threat model: the OPERATOR adversary attempting to fake their own audit trail to ' +
      'cover up violations, predate compliance checks, or forge approvals. These ' +
      `${audit.total} scenarios test the audit-evidence LAYER — signed receipts, ` +
      'hash-chained sequences, external timestamp anchors, and engine-independent ' +
      'verification — that sits on top of policy decisions.',
  );
  lines.push('');
  lines.push('| Scenario | AgentMarshal | Cedar | OPA |');
  lines.push('|---|---|---|---|');
  for (const meta of AUDIT_ROW_META) {
    const r = byId.get(meta.id);
    let am: string;
    if (!r) {
      am = '? not run';
    } else if (!r.matched_expected) {
      am = `✗ unexpected: ${r.reason}`;
    } else {
      const verb = r.expected === 'permit' ? 'supported' : 'caught';
      am = `✓ ${verb} (${meta.capability})`;
    }
    lines.push(`| ${meta.label} | ${am} | ${NO_EQUIV} | ${NO_EQUIV} |`);
  }
  lines.push(
    `| **Total** | **${audit.agentmarshal_caught}/${audit.total}** | **0/${audit.total}** | **0/${audit.total}** |`,
  );
  lines.push('');
  lines.push(
    '¹ Cedar and OPA are policy-decision engines. They do not produce signed audit ' +
      'artifacts, do not maintain decision lineage, do not anchor decisions to external ' +
      'timestamps, and do not support engine-independent verification of past decisions. ' +
      'The 0/' +
      audit.total +
      ' score is structural: there is no equivalent artifact in their model to catch ' +
      'tampering on. See [docs/spikes/cedar-opa-spike.md](../docs/spikes/cedar-opa-spike.md) for Spike G’s analysis of ' +
      'where Cedar and OPA tie AgentMarshal (the structural-authz scenarios in Section ' +
      '1 above) and where they structurally cannot compete (this section).',
  );
  lines.push('');
  return lines;
}

function trackLabel(track: TrackId): string {
  switch (track) {
    case 'A':
      return 'A — No governance';
    case 'B':
      return 'B — Naive validation';
    case 'C':
      return 'C — AgentMarshal';
  }
}

export async function writeReport(markdown: string): Promise<string> {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, markdown, 'utf-8');
  return REPORT_PATH;
}

export const reportPath = REPORT_PATH;

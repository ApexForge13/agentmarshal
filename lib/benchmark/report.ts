// Renders a BenchmarkResult into the markdown report at reports/benchmark.md.
// Auto-generated; do NOT hand-author the .md.

import { promises as fs } from 'fs';
import path from 'path';
import type { BenchmarkResult, TrackId } from './types';

const REPORT_PATH = path.resolve(process.cwd(), 'reports', 'benchmark.md');

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
  lines.push('## Reproduce');
  lines.push('');
  lines.push('```sh');
  lines.push('pnpm benchmark');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
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

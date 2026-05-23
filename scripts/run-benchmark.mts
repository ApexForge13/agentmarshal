// Benchmark CLI entry — pnpm benchmark.
// Shells out to vitest because the in-process invocation chain
// (track-c → endpoint → receipt builder → canonicalize) transitively requires
// the `canonicalize` package, which ships exports.import only (ESM-only) and
// cannot be loaded via tsx's CJS module path. Vitest has its own resolver
// that handles ESM-only deps cleanly.
//
// The integration test at tests/benchmark/runner.test.ts is the actual entry:
// it loads all 20 scenarios, runs all 3 tracks via the runner, asserts the
// headline catch-rate thresholds, and writes the markdown report to
// reports/benchmark.md as a byproduct. Running it via vitest gives a
// pass/fail exit code that doubles as the benchmark's catch-rate check.

import { spawnSync } from 'child_process';

const result = spawnSync(
  'pnpm',
  ['vitest', 'run', 'tests/benchmark/runner.test.ts', '--reporter=verbose'],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('');
console.log('Benchmark complete. See reports/benchmark.md for the full table.');

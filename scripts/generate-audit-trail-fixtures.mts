// One-shot generator for data/benchmark/fixtures/audit-trail-fixtures.json and the
// five audit_trail scenario files.
//
// Shells out to vitest (same pattern as scripts/generate-verify-examples.mts) because
// the build chain transitively imports the ESM-only `canonicalize` package, which
// tsx's CJS module path cannot resolve. The generation test writes the files as a
// byproduct when GENERATE_AUDIT_TRAIL_FIXTURES=1 is set.

import { spawnSync } from 'child_process';

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'tests/benchmark/generate-audit-trail-fixtures.test.ts', '--reporter=verbose'],
  {
    stdio: 'inherit',
    env: { ...process.env, GENERATE_AUDIT_TRAIL_FIXTURES: '1' },
  },
);

process.exit(result.status ?? 1);

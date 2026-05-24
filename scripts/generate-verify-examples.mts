// One-shot generator for data/verify/example-receipts.json.
//
// Shells out to vitest (same pattern as scripts/run-benchmark.mts) because the
// emit-and-sign chain transitively imports the ESM-only `canonicalize` package,
// which tsx's CJS module path cannot resolve. Vitest has its own ESM-capable
// resolver. The generation test writes the file as a byproduct when
// GENERATE_VERIFY_EXAMPLES=1 is set.

import { spawnSync } from 'child_process';

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'tests/verify/generate-examples.test.ts', '--reporter=verbose'],
  {
    stdio: 'inherit',
    env: { ...process.env, GENERATE_VERIFY_EXAMPLES: '1' },
  },
);

process.exit(result.status ?? 1);

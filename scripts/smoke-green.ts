// End-to-end smoke for the GREEN (normal scheduling) scenario.
// Run:  npx tsx scripts/smoke-green.ts
//
// Requires:
//   - configs/policy.yaml present
//   - Lobster Trap running at LT_PROXY_URL (default http://localhost:8080)
//   - lib/agents/scenarios.ts SCENARIOS.GREEN populated

import { runScenario } from '../lib/scenario-runner';

async function main(): Promise<void> {
  const { decision, auditId, lobsterTrapMetadata: lt } = await runScenario('GREEN');

  console.log(
    `[smoke-green] LT risk_score=${lt.risk_score} injection=${lt.contains_injection_patterns} obfuscation=${lt.contains_obfuscation}`,
  );
  console.log(
    `[smoke-green] declaredIntent=${JSON.stringify(decision.declaredIntent)} detectedIntent=${decision.detectedIntent}`,
  );
  console.log(
    `[smoke-green] verdict=${decision.action} rules_fired=[${decision.rulesFired
      .map((r) => r.name)
      .join(',')}]`,
  );
  console.log(`[smoke-green] audit row id=${auditId} written to data/agentmarshal.db`);
}

main().catch((err: unknown) => {
  console.error(`[smoke-green] FAILED: ${(err as Error).message}`);
  process.exit(1);
});

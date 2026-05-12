// End-to-end smoke for the RED (BEC) scenario.
// Run:  npx tsx scripts/smoke-bec.ts
//
// Requires:
//   - configs/policy.yaml present
//   - Lobster Trap running at LT_PROXY_URL (default http://localhost:8080)
//   - lib/agents/scenarios.ts SCENARIOS.RED populated

import { runScenario } from '../lib/scenario-runner';

async function main(): Promise<void> {
  const { decision, auditId, lobsterTrapMetadata: lt } = await runScenario('RED');

  console.log(
    `[smoke-bec] LT risk_score=${lt.risk_score} injection=${lt.contains_injection_patterns} obfuscation=${lt.contains_obfuscation}`,
  );
  console.log(
    `[smoke-bec] declaredIntent=${JSON.stringify(decision.declaredIntent)} detectedIntent=${decision.detectedIntent}`,
  );
  console.log(
    `[smoke-bec] verdict=${decision.action} rules_fired=[${decision.rulesFired
      .map((r) => r.name)
      .join(',')}]`,
  );
  console.log(`[smoke-bec] audit row id=${auditId} written to data/agentmarshal.db`);
}

main().catch((err: unknown) => {
  console.error(`[smoke-bec] FAILED: ${(err as Error).message}`);
  process.exit(1);
});

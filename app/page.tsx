// Operator dashboard entry. Server Component loads the YAML once at request
// time and hands both the raw text (for the Policy tab) and parsed fleet (for
// the sidebar) to the Client Component that owns interactive state.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Dashboard } from '@/components/Dashboard';
import { loadPolicy } from '@/lib/policy-engine';

export const dynamic = 'force-dynamic';

export default function Home() {
  const policyPath = path.resolve(process.cwd(), 'configs', 'policy.yaml');
  const policyYaml = readFileSync(policyPath, 'utf8');
  const policy = loadPolicy(policyPath);
  const fleet = policy.agents ?? [];
  const ruleCount = policy.policy_rules?.length ?? 0;
  const fleetId = policy.fleet_id ?? 'unknown';
  const operator = policy.operator ?? 'unknown';

  return (
    <Dashboard
      policyYaml={policyYaml}
      fleet={fleet}
      ruleCount={ruleCount}
      fleetId={fleetId}
      operator={operator}
    />
  );
}

// Scope Contract loader.
// Day 3 Bubble 2: returns a real ScopeContract conforming to spec/v0.1/scope-contract.schema.json.
// Default is permissive (allow any subject with id present). Day 4-5: real loading from file/DB/registry.

import type { ScopeContract } from '@/types/authzen';

const PERMISSIVE_CONTRACT: ScopeContract = {
  scope_contract_version: '0.1',
  contract_id: 'stub-permissive-v0.2-day-3',
  agent_id: 'stub-agent',
  issuer: { type: 'system', id: 'agentmarshal:stub' },
  issued_at: '2026-05-21T00:00:00Z',
  declared_scope: [
    {
      rule_id: 'stub-allow-any-subject',
      description: 'Day 3 stub: allow any request whose subject.id is present. Real loading lands Day 4-5.',
      match: {
        subject: { id: { exists: true } },
      },
      decision: {
        effect: 'allow',
        reason_code: 'STUB_PERMISSIVE_ALLOW',
        reason: 'Permissive stub contract; allows any request with a present subject.id.',
      },
    },
  ],
};

export async function loadContractForAgent(_agentId: string): Promise<ScopeContract> {
  return PERMISSIVE_CONTRACT;
}

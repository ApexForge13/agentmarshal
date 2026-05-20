// Scope Contract loader.
// Day 2: stub — returns a single in-memory always-allow contract for any agent.
// Day 3+: load real contracts, validate via schema-validator, cache by contract_id.

import type { ScopeContractEffect } from '@/types/authzen';

export interface StubScopeContract {
  scope_contract_version: '0.1';
  contract_id: string;
  agent_id: string;
  issuer: { type: 'system'; id: string };
  issued_at: string;
  declared_scope: Array<{
    rule_id: string;
    description: string;
    decision: { effect: ScopeContractEffect; reason_code: string; reason: string };
  }>;
}

const STUB_CONTRACT: StubScopeContract = {
  scope_contract_version: '0.1',
  contract_id: 'stub-allow-v0.2-day-2',
  agent_id: 'stub-agent',
  issuer: { type: 'system', id: 'agentmarshal:stub' },
  issued_at: '2026-05-20T00:00:00Z',
  declared_scope: [
    {
      rule_id: 'stub-allow-all',
      description: 'Day 2 stub — allows everything. Real evaluation lands Day 3.',
      decision: {
        effect: 'allow',
        reason_code: 'STUB_ALLOW_V0_2_DAY_2',
        reason: 'Day 2 scaffold stub. Real Scope Contract evaluation lands Day 3.',
      },
    },
  ],
};

export async function loadContractForAgent(_agentId: string): Promise<StubScopeContract> {
  return STUB_CONTRACT;
}

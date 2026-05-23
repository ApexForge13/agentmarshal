// Scope Contract loader.
// v0.2 Bubble 7: file-backed loader replaces the Day-3 single-stub fallback.
// Layout:
//   data/contracts/<contract_id>.json          — one file per contract
//   data/agent-contract-map.json                — { agent_id: contract_id }
// Behavior:
//   1. Resolve contract_id for agent via the agent-contract map.
//   2. If no mapping, fall back to STUB_PERMISSIVE_ALLOW + warn.
//   3. Load from disk on cache miss; validate against scope-contract.schema.json.
//   4. Cache parsed contract in-memory keyed by contract_id (no TTL; restart to reload).
//   5. On load/validation error, fall back to STUB_PERMISSIVE_ALLOW + warn.
// Deferred to a later bubble: hot reload (fs.watch), DB-backed storage,
// multi-version supersession, schema migration.

import { promises as fs } from 'fs';
import path from 'path';
import type { ScopeContract } from '@/types/authzen';
import { validateContract, formatContractErrors } from './contract-schema';

const CONTRACTS_DIR = path.resolve(process.cwd(), 'data', 'contracts');
const AGENT_MAP_PATH = path.resolve(process.cwd(), 'data', 'agent-contract-map.json');

const STUB_PERMISSIVE_ALLOW: ScopeContract = {
  scope_contract_version: '0.1',
  contract_id: 'stub-permissive-v0.2-day-3',
  agent_id: 'stub-agent',
  issuer: { type: 'system', id: 'agentmarshal:stub' },
  issued_at: '2026-05-21T00:00:00Z',
  declared_scope: [
    {
      rule_id: 'stub-allow-any-subject',
      description: 'Fallback stub: allow any request whose subject.id is present. Used when no agent→contract mapping or file-backed contract is available.',
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

const contractCache = new Map<string, ScopeContract>();
const contractOverrides = new Map<string, ScopeContract>();
let agentMapCache: Record<string, string> | null = null;

export function clearContractCache(): void {
  contractCache.clear();
  agentMapCache = null;
}

/**
 * Register a contract override keyed by agent_id. When loadContractForAgent is
 * called with a matching agent_id, the override is returned instead of the
 * file-backed contract. Intended for benchmark / test scenarios that need
 * per-scenario contract injection without modifying data/agent-contract-map.json
 * or data/contracts/. Production code MUST NOT depend on this.
 */
export function setContractOverride(agentId: string, contract: ScopeContract): void {
  contractOverrides.set(agentId, contract);
}

export function clearContractOverrides(): void {
  contractOverrides.clear();
}

export async function resolveContractIdForAgent(agentId: string): Promise<string | null> {
  if (agentMapCache === null) {
    try {
      const raw = await fs.readFile(AGENT_MAP_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('agent-contract-map.json: expected a JSON object at the root');
      }
      agentMapCache = parsed as Record<string, string>;
    } catch (err) {
      console.warn(
        `contracts: failed to load agent-contract-map.json (${(err as Error).message}); ` +
          `all agents will fall back to STUB_PERMISSIVE_ALLOW.`,
      );
      agentMapCache = {};
    }
  }
  return agentMapCache[agentId] ?? null;
}

export async function loadContractFromDisk(contractId: string): Promise<ScopeContract> {
  const filePath = path.join(CONTRACTS_DIR, `${contractId}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const validation = validateContract(parsed);
  if (!validation.valid) {
    const details = formatContractErrors(validation.errors).join('; ');
    throw new Error(
      `contracts: ${contractId}.json failed scope-contract.schema.json validation: ${details}`,
    );
  }
  return parsed as ScopeContract;
}

export async function loadContractForAgent(agentId: string): Promise<ScopeContract> {
  const override = contractOverrides.get(agentId);
  if (override) return override;

  const contractId = await resolveContractIdForAgent(agentId);
  if (contractId === null) {
    return STUB_PERMISSIVE_ALLOW;
  }

  const cached = contractCache.get(contractId);
  if (cached) return cached;

  try {
    const contract = await loadContractFromDisk(contractId);
    contractCache.set(contractId, contract);
    return contract;
  } catch (err) {
    console.warn(
      `contracts: failed to load ${contractId} for agent ${agentId} (${(err as Error).message}); ` +
        `falling back to STUB_PERMISSIVE_ALLOW.`,
    );
    return STUB_PERMISSIVE_ALLOW;
  }
}

/**
 * Optional warm-up: load every contract referenced by the agent-contract map
 * into the in-memory cache. Not auto-called; intended for startup paths that
 * want to surface contract errors at boot rather than on first request.
 */
export async function loadAllContractsForStartup(): Promise<{
  loaded: string[];
  failed: Array<{ contract_id: string; error: string }>;
}> {
  const loaded: string[] = [];
  const failed: Array<{ contract_id: string; error: string }> = [];

  // Force agent-map load.
  await resolveContractIdForAgent('__warmup__');
  const uniqueContractIds = new Set<string>(Object.values(agentMapCache ?? {}));

  for (const contractId of uniqueContractIds) {
    if (contractCache.has(contractId)) {
      loaded.push(contractId);
      continue;
    }
    try {
      const contract = await loadContractFromDisk(contractId);
      contractCache.set(contractId, contract);
      loaded.push(contractId);
    } catch (err) {
      failed.push({ contract_id: contractId, error: (err as Error).message });
    }
  }

  return { loaded, failed };
}

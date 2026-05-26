// Ambient feed simulation pool (Bubble 16).
//
// A continuous background loop in TradingDesk fires these through the REAL
// /api/access/v1/evaluation endpoint at jittered intervals so the dashboard feels
// alive when a judge or investor loads it cold — most decisions clear green, a
// handful flag yellow for review, a rare red is a hard SDN hit. These are inline
// AuthZEN payloads (the demo sequence reads byte-identical payloads from the
// benchmark files; the ambient pool is broader + client-bundled, so it is pure
// data — no fs/crypto). The injected SDN list mirrors the OFAC fixture snapshot.
//
// The selection + jitter math live here as pure functions so they unit-test
// without a running interval (the loop itself is thin glue in TradingDesk).

import type { AuthZenRequest } from '@/types/authzen';

// Same 3-entry fixture snapshot the trading scenarios + RegulatoryPanel use. Green
// entities are clean; yellows contain a region token (IRAN/CRIMEA/DPRK) found in
// these entries → substring review; the red is an exact hit → hard deny.
const FIXTURE_SDN_LIST: readonly string[] = [
  'SYN-SDN-IRAN-MARITIME-001',
  'SYN-SDN-CRIMEA-BANK-007',
  'SYN-SDN-DPRK-TRADING-042',
];

export type AmbientWeightClass = 'green' | 'yellow' | 'red';

export interface AmbientScenario {
  id: string;
  weightClass: AmbientWeightClass;
  request: AuthZenRequest;
}

const RESOURCE_TYPE: Record<string, string> = {
  propose_trade: 'counterparty',
  execute_trade: 'counterparty',
  fetch_research: 'research_target',
  run_risk_check: 'risk_subject',
};

function mk(
  weightClass: AmbientWeightClass,
  type: string,
  id: string,
  action: string,
  entityId: string,
): AmbientScenario {
  return {
    id: `${type}-${action}-${entityId}`,
    weightClass,
    request: {
      subject: { type, id },
      action: {
        name: action,
        properties: {
          regulatory_state: { ofac_sdn_list: [...FIXTURE_SDN_LIST] },
          entity: { id: entityId },
        },
      },
      resource: { type: RESOURCE_TYPE[action] ?? 'counterparty', id: entityId },
    },
  };
}

// Clean counterparties — clear to PERMIT (no exact hit, no region-token substring).
export const GREEN_SCENARIOS: readonly AmbientScenario[] = [
  mk('green', 'TradingAgent', 'trading-agent-001', 'propose_trade', 'ENT-MORGAN-STANLEY-001'),
  mk('green', 'TradingAgent', 'trading-agent-001', 'propose_trade', 'ENT-GOLDMAN-SACHS-007'),
  mk('green', 'TradingAgent', 'trading-agent-001', 'propose_trade', 'ENT-JPM-CHASE-042'),
  mk('green', 'ResearchAgent', 'research-agent-001', 'fetch_research', 'ENT-BLOOMBERG-DATA-002'),
  mk('green', 'ResearchAgent', 'research-agent-001', 'fetch_research', 'ENT-FACTSET-CORP-009'),
  mk('green', 'ResearchAgent', 'research-agent-001', 'fetch_research', 'ENT-SP-GLOBAL-887'),
  mk('green', 'RiskAgent', 'risk-agent-001', 'run_risk_check', 'ENT-CHARLES-SCHWAB-012'),
  mk('green', 'RiskAgent', 'risk-agent-001', 'run_risk_check', 'ENT-FIDELITY-INV-018'),
  mk('green', 'ExecutionAgent', 'execution-agent-001', 'execute_trade', 'ENT-DTCC-CLEAN-1234'),
  mk('green', 'ExecutionAgent', 'execution-agent-001', 'execute_trade', 'ENT-CITADEL-CORP-099'),
];

// Possible matches — substring of an SDN region token → REVIEW (blocked pending review).
export const YELLOW_SCENARIOS: readonly AmbientScenario[] = [
  mk('yellow', 'ResearchAgent', 'research-agent-001', 'fetch_research', 'ENT-IRAN-RESEARCH-555'),
  mk('yellow', 'TradingAgent', 'trading-agent-001', 'propose_trade', 'ENT-CRIMEA-HOLDINGS-LLC'),
  mk('yellow', 'RiskAgent', 'risk-agent-001', 'run_risk_check', 'ENT-DPRK-CORP-77'),
];

// The hero — exact SDN hit → hard DENY.
export const RED_SCENARIOS: readonly AmbientScenario[] = [
  mk('red', 'ExecutionAgent', 'execution-agent-001', 'execute_trade', 'SYN-SDN-IRAN-MARITIME-001'),
];

// Jittered interval: 3000ms + random(0–5000)ms between firings (Bubble 16 spec).
export const AMBIENT_BASE_MS = 3000;
export const AMBIENT_JITTER_MS = 5000;

/** Delay before the next ambient firing. rand ∈ [0,1) ⇒ [3000, 8000)ms. */
export function jitterDelay(rand: number = Math.random()): number {
  return AMBIENT_BASE_MS + Math.floor(rand * AMBIENT_JITTER_MS);
}

/** Weighted pool selection: 80% green, 15% yellow, 5% red. */
export function pickPool(rand: number = Math.random()): AmbientWeightClass {
  if (rand < 0.8) return 'green';
  if (rand < 0.95) return 'yellow';
  return 'red';
}

function poolFor(cls: AmbientWeightClass): readonly AmbientScenario[] {
  if (cls === 'green') return GREEN_SCENARIOS;
  if (cls === 'yellow') return YELLOW_SCENARIOS;
  return RED_SCENARIOS;
}

/**
 * Pick one ambient scenario. poolRand selects the weighted pool; pickRand selects
 * within it. Both default to Math.random() in production; tests pass fixed values
 * to assert the weighting + selection deterministically.
 */
export function selectAmbientScenario(
  poolRand: number = Math.random(),
  pickRand: number = Math.random(),
): AmbientScenario {
  const pool = poolFor(pickPool(poolRand));
  const idx = Math.min(pool.length - 1, Math.floor(pickRand * pool.length));
  return pool[idx];
}

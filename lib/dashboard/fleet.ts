// Trading-desk fleet roster + status derivation (Phase 2).

import type { FeedDecision, FeedEntry } from './feed';

export interface FleetAgentMeta {
  /** subject.type — the fleet key and the agent-contract-map fallback key. */
  type: string;
  /** Role subhead shown on the card. */
  role: string;
}

// The four trading-desk agents, top-to-bottom. Ordered along the trade
// lifecycle: research → propose → risk → execute is the conceptual flow, but the
// card order below mirrors the spec's Phase 2 listing.
export const TRADING_FLEET: readonly FleetAgentMeta[] = [
  { type: 'TradingAgent', role: 'Proposes trades based on research signals' },
  { type: 'ResearchAgent', role: 'Fetches market research and entity intelligence' },
  { type: 'RiskAgent', role: 'Runs pre-trade risk checks' },
  { type: 'ExecutionAgent', role: 'Executes approved trades' },
];

// idle: no decision yet. active: receipt just emitted (transient flash).
// permit/deny: settled to the agent's last decision color.
export type AgentStatus = 'idle' | 'active' | 'permit' | 'deny';

/** Last decision per agent type, walking the feed newest → oldest. */
export function lastDecisionByType(entries: FeedEntry[]): Map<string, FeedDecision> {
  const map = new Map<string, FeedDecision>();
  for (const e of entries) {
    if (!map.has(e.agentType)) map.set(e.agentType, e.decision);
  }
  return map;
}

/** Resolve a card's status: an active flash wins, else the settled last decision. */
export function statusFor(
  agentType: string,
  lastDecisions: Map<string, FeedDecision>,
  flashingType: string | null,
): AgentStatus {
  if (flashingType === agentType) return 'active';
  return lastDecisions.get(agentType) ?? 'idle';
}

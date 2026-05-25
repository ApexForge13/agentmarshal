// Demo-sequence scenario loader (Bubble 14, Phase 6).
// Order + payload sanity, and a drift-lock between the scenarios' injected SDN
// list and the regulatory provider's list (so the feed and the panel agree).

import { describe, it, expect } from 'vitest';
import { loadDemoScenarios } from '@/lib/dashboard/demo-scenarios';
import { getOfacSnapshot } from '@/lib/regulatory/ofac';

describe('loadDemoScenarios', () => {
  const scenarios = loadDemoScenarios();

  it('returns the four trading scenarios in narrative order (permits, then the deny)', () => {
    expect(scenarios.map((s) => s.id)).toEqual([
      'trading_v1-02-legit-propose-trade-clean',
      'trading_v1-03-legit-research-clean',
      'trading_v1-04-legit-risk-check-clean',
      'trading_v1-01-adv-execution-sanctioned-counterparty',
    ]);
  });

  it('carries the expected subject.type / action.name per agent', () => {
    expect(scenarios.map((s) => s.request.subject.type)).toEqual([
      'TradingAgent',
      'ResearchAgent',
      'RiskAgent',
      'ExecutionAgent',
    ]);
    expect(scenarios.map((s) => s.request.action.name)).toEqual([
      'propose_trade',
      'fetch_research',
      'run_risk_check',
      'execute_trade',
    ]);
  });

  it('uses instance-id subject.ids that are NOT map keys (so the type fallback is exercised)', () => {
    expect(scenarios.map((s) => s.request.subject.id)).toEqual([
      'trading-agent-001',
      'research-agent-001',
      'risk-agent-001',
      'execution-agent-001',
    ]);
  });

  it('injects the same SDN list the regulatory panel renders (drift-lock)', () => {
    const providerList = getOfacSnapshot().list;
    for (const s of scenarios) {
      const props = s.request.action.properties as
        | { regulatory_state?: { ofac_sdn_list?: string[] } }
        | undefined;
      expect(props?.regulatory_state?.ofac_sdn_list).toEqual(providerList);
    }
  });

  it('screens the hero entity as sanctioned and the rest as clean', () => {
    const providerList = getOfacSnapshot().list;
    const entityOf = (i: number) =>
      (scenarios[i].request.action.properties as { entity?: { id?: string } } | undefined)?.entity
        ?.id;
    // 0..2 are the legit permits; 3 is the adversarial deny.
    expect(providerList).not.toContain(entityOf(0));
    expect(providerList).not.toContain(entityOf(1));
    expect(providerList).not.toContain(entityOf(2));
    expect(providerList).toContain(entityOf(3));
  });
});

// Demo-sequence scenarios for the trading-desk dashboard (Phase 6).
//
// The "Run demo sequence" trigger fires these four AuthZEN requests through the
// real /api/access/v1/evaluation endpoint — NOT setContractOverride. Their
// contracts resolve via the Bubble 14 subject.type fallback: subject.id
// (trading-agent-001, …) misses the agent-contract map, subject.type
// (TradingAgent, …) hits the type-name keys → trading_v1.
//
// Source of truth: the canonical benchmark scenario files. We read them at
// request time (server only — fs) and extract the AuthZEN `request`, so the demo
// and the benchmark exercise byte-identical payloads with no second copy to drift.
//
// Narrative order: three permits, then the adversarial deny last, so the demo
// recording builds to the OFAC-sanctioned-counterparty block.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AuthZenRequest } from '@/types/authzen';

export interface DemoScenario {
  /** Canonical scenario id (e.g. trading_v1-01-…). */
  id: string;
  /** Human label for narration / the trigger UI. */
  label: string;
  /** AuthZEN request fired through the production endpoint. */
  request: AuthZenRequest;
}

const SCENARIO_DIR = path.resolve(process.cwd(), 'data', 'benchmark', 'scenarios');

// Ordered for the demo: permits first (02 propose, 03 research, 04 risk), then
// the hero adversarial deny (01 execute against a sanctioned counterparty).
const DEMO_SEQUENCE: ReadonlyArray<{ file: string; label: string }> = [
  { file: 'trading_v1-02-legit-propose-trade-clean.json', label: 'TradingAgent · propose_trade' },
  { file: 'trading_v1-03-legit-research-clean.json', label: 'ResearchAgent · fetch_research' },
  { file: 'trading_v1-04-legit-risk-check-clean.json', label: 'RiskAgent · run_risk_check' },
  {
    file: 'trading_v1-01-adv-execution-sanctioned-counterparty.json',
    label: 'ExecutionAgent · execute_trade (sanctioned counterparty)',
  },
];

export function loadDemoScenarios(): DemoScenario[] {
  return DEMO_SEQUENCE.map(({ file, label }) => {
    const raw = readFileSync(path.join(SCENARIO_DIR, file), 'utf-8');
    const parsed = JSON.parse(raw) as { id: string; request: AuthZenRequest };
    return { id: parsed.id, label, request: parsed.request };
  });
}

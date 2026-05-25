// Trading-desk dashboard entry (Bubble 14) — replaces the v0.1 mike-cortez
// Mission Control at demo.agentmarshal.dev.
//
// Server Component: resolves the OFAC SDN snapshot (regulatory provider) and the
// demo-sequence scenario requests at request time, hands both to the client
// TradingDesk that owns the activity feed + demo runner.

import { TradingDesk } from '@/components/trading-desk/TradingDesk';
import { getOfacSnapshot } from '@/lib/regulatory/ofac';
import { loadDemoScenarios } from '@/lib/dashboard/demo-scenarios';

export const dynamic = 'force-dynamic';

export default function Home() {
  const snapshot = getOfacSnapshot();
  const demoScenarios = loadDemoScenarios();

  return <TradingDesk snapshot={snapshot} demoScenarios={demoScenarios} />;
}

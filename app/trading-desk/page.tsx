// Trading Desk dashboard (Bubble 14 content). Relocated to /trading-desk in
// Bubble 27 — the bare "/" route now redirects to /receipts (Bubble 25), so this
// is the dashboard's home. Server Component: resolves the OFAC SDN snapshot and
// the demo-sequence scenario requests at request time (loadDemoScenarios reads
// data/benchmark/scenarios, seeded onto the Fly volume) and hands both to the
// client TradingDesk that owns the activity feed + the live "Run sequence" runner.

import { TradingDesk } from '@/components/trading-desk/TradingDesk';
import { getOfacSnapshot } from '@/lib/regulatory/ofac';
import { loadDemoScenarios } from '@/lib/dashboard/demo-scenarios';

export const dynamic = 'force-dynamic';

export default function TradingDeskPage() {
  const snapshot = getOfacSnapshot();
  const demoScenarios = loadDemoScenarios();
  return <TradingDesk snapshot={snapshot} demoScenarios={demoScenarios} />;
}

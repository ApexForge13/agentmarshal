// /scope-contracts — the architectural artifact AgentMarshal is built around.
//
// Server Component shell. The active contract (trading_v1) is the live seed
// contract the trading desk evaluates against; the other fleets are placeholders.
// The interactive client renders the cards + the full contract JSON in the rail.

import { ScopeContractsClient } from './scope-contracts-client';

export const dynamic = 'force-dynamic';

export default function ScopeContractsPage() {
  return <ScopeContractsClient />;
}

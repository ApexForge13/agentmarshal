// /receipts — persisted-receipt browser + tamper-edit (Bubble 21).
//
// Server Component shell: reads the captured demo-receipt fixtures from disk at request
// time (lib/dashboard/demo-receipts.ts) and hands them to the interactive client, which
// also subscribes to the session's live feed store. Real signed records throughout — the
// detail panel re-verifies them against the published key via /api/verify/receipt.

import { loadDemoReceipts } from '@/lib/dashboard/demo-receipts';
import { ReceiptsClient } from './receipts-client';

export const dynamic = 'force-dynamic';

export default function ReceiptsPage() {
  const fixtures = loadDemoReceipts();
  return <ReceiptsClient fixtures={fixtures} />;
}

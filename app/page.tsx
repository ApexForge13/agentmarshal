// Bubble 25: the bare demo URL redirects to /receipts, the cold-open surface
// judges should see first. The Trading Desk dashboard that previously rendered
// here is left in place (components/trading-desk/) but is no longer the landing
// route. Default (temporary, 307) redirect.

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/receipts');
}

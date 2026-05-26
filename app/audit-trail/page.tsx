// /audit-trail — every signed decision the dashboard produced this session.
//
// Server Component shell: the data lives in the client-side session feed store
// (lib/dashboard/feed-store.ts), which the dashboard writes to as the ambient loop
// fires. This page mounts the interactive client that subscribes to that same
// store, so it shows whatever / has streamed (preserved across <Link> navigation).

import { AuditTrailClient } from './audit-trail-client';

export const dynamic = 'force-dynamic';

export default function AuditTrailPage() {
  return <AuditTrailClient />;
}

'use client';

// /receipts persisted-receipt browser (Bubble 21).
//
// Left rail: a list of signed records — the persisted demo fixtures (read from disk by
// the server component) plus this session's live decisions from the shared feed store
// (so a record produced on the Trading Desk shows up here across <Link> navigation).
// Selecting a row loads it into the polished detail panel (ReceiptDetail), which carries
// the one-click Verify and the tamper-edit cold-open. Default selection is the first
// DENY (the Helix Bridge adverse-media fail) so the hero record is on screen at load.

import { useCallback, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { ReceiptList } from '@/components/receipts/ReceiptList';
import { ReceiptDetail } from '@/components/receipts/ReceiptDetail';
import { useReceiptFeed, type FeedEntry, type SignedRecord } from '@/lib/dashboard/feed';
import { sharedFeed } from '@/lib/dashboard/feed-store';
import { makeFeedEntryFromRecord, recordHash, previousHash } from '@/lib/dashboard/receipt-display';

export function ReceiptsClient({ fixtures }: { fixtures: SignedRecord[] }) {
  const fixtureEntries = useMemo(() => fixtures.map(makeFeedEntryFromRecord), [fixtures]);
  const liveEntries = useReceiptFeed(sharedFeed);

  // Live session entries (already newest-first) above persisted fixtures, de-duped by id.
  const entries = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedEntry[] = [];
    for (const e of [...liveEntries, ...fixtureEntries]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  }, [liveEntries, fixtureEntries]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (selectedId) {
      const hit = entries.find((e) => e.id === selectedId);
      if (hit) return hit;
    }
    return entries.find((e) => e.decision === 'deny') ?? entries[0] ?? null;
  }, [entries, selectedId]);

  const onNavigate = useCallback(
    (hash: string) => {
      const target = entries.find((e) => e.record && recordHash(e.record) === hash);
      if (target) setSelectedId(target.id);
    },
    [entries],
  );

  const hasPrevInView = useMemo(() => {
    if (!selected?.record) return false;
    const prev = previousHash(selected.record);
    if (!prev) return false;
    return entries.some((e) => e.record && recordHash(e.record) === prev);
  }, [selected, entries]);

  const hasDeny = entries.some((e) => e.decision === 'deny');

  return (
    <AppShell notify={hasDeny}>
      <div className="page">
        <div className="rcpt-listcol">
          <div className="page-header" style={{ padding: '14px 16px', alignItems: 'center' }}>
            <div>
              <h1 className="page-title" style={{ fontSize: 16 }}>
                Receipts
              </h1>
              <div className="page-sub">{entries.length} signed records</div>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <ReceiptList entries={entries} selectedId={selected?.id ?? null} onSelect={(e) => setSelectedId(e.id)} />
          </div>
        </div>

        <div className="page-main" style={{ overflow: 'auto' }}>
          {selected ? (
            <ReceiptDetail entry={selected} hasPrevInView={hasPrevInView} onNavigate={onNavigate} />
          ) : (
            <div className="empty">Select a receipt to inspect and verify it.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

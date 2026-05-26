'use client';

// /audit-trail client (Bubble 16). Subscribes to the session-scoped feed store and
// renders all of the session's signed decisions in a full-width ActivityFeed,
// paginated at 50/page. Clicking a row opens its ReceiptRail (the same component
// the dashboard uses); the default rail shows session metadata + a decision
// breakdown. Read-only: this page never writes to the store (the ambient loop runs
// only on the dashboard), so the list is stable while you page through it.

import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { ActivityFeed } from '@/components/trading-desk/ActivityFeed';
import { ReceiptRail } from '@/components/trading-desk/ReceiptRail';
import { useReceiptFeed, decisionBreakdown, type FeedEntry } from '@/lib/dashboard/feed';
import { sharedFeed, sessionStartedAt } from '@/lib/dashboard/feed-store';

const PAGE_SIZE = 50;

const RAIL_TITLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text)',
};

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function SessionPanel({ entries }: { entries: FeedEntry[] }) {
  const b = decisionBreakdown(entries);
  return (
    <div>
      <div className="rail-header">
        <span style={RAIL_TITLE}>Session</span>
        <span className="x" style={{ cursor: 'default' }}>—</span>
      </div>
      <div className="rail-section">
        <div className="title">Overview</div>
        <Kv k="Session start" v={sessionStartedAt} />
        <Kv k="Total receipts" v={String(entries.length)} />
      </div>
      <div className="rail-section">
        <div className="title">Decision breakdown</div>
        <Kv k="Permit" v={<span className="badge healthy">{String(b.permit)}</span>} />
        <Kv k="Review" v={<span className="badge warning">{String(b.review)}</span>} />
        <Kv k="Deny" v={<span className="badge danger">{String(b.deny)}</span>} />
      </div>
      <div className="rail-section">
        <div className="title">About</div>
        <p style={{ fontSize: 11, lineHeight: 1.65, color: 'var(--text-3)', margin: 0 }}>
          Every decision the fleet makes is emitted as a signed, hash-chained record. Click any row
          to inspect its receipt and re-verify the signature independently.
        </p>
      </div>
    </div>
  );
}

export function AuditTrailClient() {
  const entries = useReceiptFeed(sharedFeed);
  const [selected, setSelected] = useState<FeedEntry | null>(null);
  const [page, setPage] = useState(0);

  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp when the store shrinks (capacity eviction) or entries change underfoot.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);
  const denies = entries.filter((e) => e.decision === 'deny').length;

  return (
    <AppShell notify={denies > 0}>
      <div className="page">
        <div
          className="page-main"
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div className="page-header">
            <div>
              <h1 className="page-title">Audit Trail</h1>
              <div className="page-sub">Session receipts · {total} entries</div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <ActivityFeed
              entries={pageEntries}
              selectedId={selected?.id ?? null}
              freshId={null}
              onSelect={setSelected}
            />
          </div>

          {total > PAGE_SIZE && (
            <div className="pager">
              <span>
                {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}
              </span>
              <div className="pages">
                <button
                  type="button"
                  className="page-btn"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {Array.from({ length: pageCount }, (_, i) => (
                  <button
                    type="button"
                    key={i}
                    className={i === safePage ? 'page-btn active' : 'page-btn'}
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className="page-btn"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="page-rail">
          {selected ? (
            <ReceiptRail entry={selected} onClose={() => setSelected(null)} />
          ) : (
            <SessionPanel entries={entries} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

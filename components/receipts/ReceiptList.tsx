'use client';

// Left-rail receipt browser list (Bubble 21). One row per signed record — persisted
// demo fixtures + this session's live decisions — newest-first. Each row shows the
// decision, the agent, the screened entity (or action), and the issuance time. Click
// loads the record into the detail panel.

import type { FeedEntry, FeedDecision } from '@/lib/dashboard/feed';

const DECISION: Record<FeedDecision, { cls: string; label: string }> = {
  permit: { cls: 'healthy', label: 'PERMIT' },
  review: { cls: 'warning', label: 'REVIEW' },
  deny: { cls: 'danger', label: 'DENY' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ReceiptList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: FeedEntry[];
  selectedId: string | null;
  onSelect: (entry: FeedEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="empty">
        No receipts yet.
        <br />
        Run the Trading Desk to stream signed decisions here.
      </div>
    );
  }
  return (
    <div role="listbox" aria-label="Signed receipts">
      {entries.map((e) => {
        const d = DECISION[e.decision];
        const selected = e.id === selectedId;
        return (
          <button
            key={e.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={selected ? 'rcpt-row selected' : 'rcpt-row'}
            onClick={() => onSelect(e)}
          >
            <div className="rcpt-row-top">
              <span className={`badge ${d.cls}`}>{d.label}</span>
              <span className="rcpt-agent">{e.agentType}</span>
            </div>
            <div className="rcpt-entity">{e.entityId ?? e.actionName}</div>
            <div className="rcpt-meta">
              <span>{fmtTime(e.issuedAt)}</span>
              <span className="rcpt-action">{e.actionName}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

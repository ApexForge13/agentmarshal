// Activity feed (Phase 4) — Echo OS .feed / .feed-row stream, newest first.
// Columns: time · agent · action · entity · decision · composite. New rows get
// the 1.5s burnt-orange .fresh sweep; a row click selects it (opens the rail).

import type { FeedDecision, FeedEntry } from '@/lib/dashboard/feed';

// time · agent · action · entity · decision · composite
const COLS = '74px 116px 108px minmax(0, 1fr) 78px minmax(0, 1.6fr)';

// Three-state row styling (Bubble 16). review rows get a persistent yellow left
// border + warning-toned composite text so a handful of holds stand out among a
// stream of green permits; deny keeps the red badge + red text.
const DECISION_STYLE: Record<
  FeedDecision,
  { badge: string; label: string; textColor?: string; border?: string }
> = {
  permit: { badge: 'healthy', label: 'PERMIT' },
  review: { badge: 'warning', label: 'REVIEW', textColor: 'var(--warning)', border: 'var(--warning)' },
  deny: { badge: 'danger', label: 'DENY', textColor: 'var(--danger)' },
};

/** HH:MM:SS from an ISO timestamp, UTC, no locale/timezone drift. */
function timeOf(iso: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

export function ActivityFeed({
  entries,
  selectedId,
  freshId,
  onSelect,
}: {
  entries: FeedEntry[];
  selectedId: string | null;
  freshId: string | null;
  onSelect: (entry: FeedEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="feed">
        <div className="empty">No activity yet — run the demo sequence to stream signed decisions</div>
      </div>
    );
  }

  return (
    <div className="feed">
      {entries.map((entry) => {
        const ds = DECISION_STYLE[entry.decision];
        const selected = entry.id === selectedId;
        const fresh = entry.id === freshId;
        return (
          <div
            key={entry.id}
            className={fresh ? 'feed-row fresh' : 'feed-row'}
            style={{
              gridTemplateColumns: COLS,
              cursor: 'pointer',
              // Persistent decision border once the fresh sweep + selection clear.
              ...(ds.border && !selected && !fresh ? { borderLeftColor: ds.border } : {}),
              ...(selected ? { borderLeftColor: 'var(--accent)', background: 'rgba(204,85,0,0.06)' } : {}),
            }}
            onClick={() => onSelect(entry)}
          >
            <span className="ts">{timeOf(entry.issuedAt)}</span>
            <span className="agent">{entry.agentType}</span>
            <span style={{ color: 'var(--text-2)' }}>{entry.actionName}</span>
            <span
              style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={entry.entityId ?? undefined}
            >
              {entry.entityId ?? '—'}
            </span>
            <span className={`badge ${ds.badge}`}>{ds.label}</span>
            <span className="out" style={ds.textColor ? { color: ds.textColor } : undefined}>
              {entry.compositeSummary}
            </span>
          </div>
        );
      })}
    </div>
  );
}

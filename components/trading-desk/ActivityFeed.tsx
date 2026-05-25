// Activity feed (Phase 4) — Echo OS .feed / .feed-row stream, newest first.
// Columns: time · agent · action · entity · decision · composite. New rows get
// the 1.5s burnt-orange .fresh sweep; a row click selects it (opens the rail).

import type { FeedEntry } from '@/lib/dashboard/feed';

// time · agent · action · entity · decision · composite
const COLS = '74px 116px 108px minmax(0, 1fr) 78px minmax(0, 1.6fr)';

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
        const permit = entry.decision === 'permit';
        const selected = entry.id === selectedId;
        return (
          <div
            key={entry.id}
            className={entry.id === freshId ? 'feed-row fresh' : 'feed-row'}
            style={{
              gridTemplateColumns: COLS,
              cursor: 'pointer',
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
            <span className={`badge ${permit ? 'healthy' : 'danger'}`}>
              {permit ? 'PERMIT' : 'DENY'}
            </span>
            <span className="out" style={permit ? undefined : { color: 'var(--danger)' }}>
              {entry.compositeSummary}
            </span>
          </div>
        );
      })}
    </div>
  );
}

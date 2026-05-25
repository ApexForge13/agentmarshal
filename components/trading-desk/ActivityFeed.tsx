// Middle column — live activity feed (Phase 4).
// Receipts stream newest-first. A row click opens the receipt viewer.

import { cn } from '@/lib/utils';
import type { FeedEntry } from '@/lib/dashboard/feed';

/** HH:MM:SS from an ISO timestamp, UTC, without locale/timezone drift. */
function timeOf(iso: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

export function ActivityFeed({
  entries,
  selectedId,
  onSelect,
}: {
  entries: FeedEntry[];
  selectedId: string | null;
  onSelect: (entry: FeedEntry) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Activity feed</div>
          <div className="mt-1 text-sm font-medium text-zinc-100">Live decisions</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          {entries.length} {entries.length === 1 ? 'receipt' : 'receipts'}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
          <p className="max-w-xs text-sm text-zinc-600">
            No activity yet. Run the demo sequence to stream signed decisions into the feed.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-zinc-900 overflow-y-auto">
          {entries.map((entry) => (
            <FeedRow
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedId}
              onClick={() => onSelect(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedRow({
  entry,
  selected,
  onClick,
}: {
  entry: FeedEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const permit = entry.decision === 'permit';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-zinc-900',
          selected && 'bg-zinc-900',
          'border-l-2',
          permit ? 'border-l-emerald-600' : 'border-l-red-600',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-zinc-500">{timeOf(entry.issuedAt)}</span>
          <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
            {entry.agentType}
          </span>
          <span className="font-mono text-xs text-zinc-200">{entry.actionName}</span>
          <span
            className={cn(
              'ml-auto px-2 py-0.5 text-[10px] font-semibold tracking-wider',
              permit
                ? 'bg-emerald-950/60 text-emerald-300'
                : 'bg-red-950/60 text-red-300',
            )}
          >
            {permit ? 'PERMIT' : 'DENY'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-zinc-500">entity</span>
          <span
            className="max-w-[16rem] truncate font-mono text-zinc-400"
            title={entry.entityId ?? undefined}
          >
            {entry.entityId ?? '—'}
          </span>
        </div>
        <div
          className={cn(
            'font-mono text-[11px]',
            entry.decision === 'deny' ? 'text-red-400/90' : 'text-zinc-500',
          )}
        >
          {entry.compositeSummary}
        </div>
      </button>
    </li>
  );
}

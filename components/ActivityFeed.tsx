// Scrollable activity stream. One row per audit entry, newest at top.

import { cn } from '@/lib/utils';
import type { Action, AuditEntry } from '@/types';
import { entryDetail } from '@/lib/dashboard-helpers';

export interface ActivityFeedProps {
  entries: AuditEntry[];
}

const DOT_CLASS: Record<Action, string> = {
  ALLOW: 'bg-emerald-500',
  HUMAN_REVIEW: 'bg-amber-500',
  DENY: 'bg-rose-500',
};

const ACTION_LABEL: Record<Action, string> = {
  ALLOW: 'ALLOWED',
  HUMAN_REVIEW: 'REVIEW',
  DENY: 'BLOCKED',
};

const ACTION_TEXT: Record<Action, string> = {
  ALLOW: 'text-emerald-400',
  HUMAN_REVIEW: 'text-amber-400',
  DENY: 'text-rose-400',
};

export function ActivityFeed({ entries }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500">
        No activity yet. Trigger the demo sequence to populate the stream.
      </div>
    );
  }
  const visible = entries.slice(0, 50);
  return (
    <div className="divide-y divide-zinc-800">
      {visible.map((e) => {
        const rule = e.rulesFired[0];
        return (
          <div
            key={e.id}
            className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-900/40"
          >
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                DOT_CLASS[e.action],
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                <span className="font-mono">{e.timestamp}</span>
                <span className="font-mono text-zinc-300 truncate">{e.agentId}</span>
                <span className={cn('font-medium', ACTION_TEXT[e.action])}>
                  {ACTION_LABEL[e.action]}
                </span>
                {rule && (
                  <span className="font-mono text-zinc-500 truncate">
                    {rule.flag}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-sm text-zinc-200 truncate">
                {entryDetail(e)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

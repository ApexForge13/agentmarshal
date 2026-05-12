// Full audit table. Already newest-first from the API.

import { cn } from '@/lib/utils';
import type { Action, AuditEntry } from '@/types';

export interface AuditLogProps {
  entries: AuditEntry[];
}

const ACTION_CLASS: Record<Action, string> = {
  ALLOW: 'text-emerald-400',
  HUMAN_REVIEW: 'text-amber-400',
  DENY: 'text-rose-400',
};

export function AuditLog({ entries }: AuditLogProps) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500">
        No audit rows yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm">
          <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Timestamp</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Rule</th>
            <th className="px-3 py-2 font-medium">Declared intent</th>
            <th className="px-3 py-2 font-medium">Detected intent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {entries.map((e) => {
            const rule = e.rulesFired[0];
            return (
              <tr key={e.id} className="hover:bg-zinc-900/40">
                <td className="px-3 py-2 font-mono text-zinc-400">#{e.id}</td>
                <td className="px-3 py-2 font-mono text-zinc-400">
                  {e.timestamp}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-200">{e.agentId}</td>
                <td
                  className={cn(
                    'px-3 py-2 font-medium tracking-wide',
                    ACTION_CLASS[e.action],
                  )}
                >
                  {e.action}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {rule ? rule.name : '—'}
                </td>
                <td className="px-3 py-2 text-zinc-300 max-w-[260px] truncate">
                  {e.declaredIntent}
                </td>
                <td className="px-3 py-2 text-zinc-300 max-w-[260px] truncate">
                  {e.detectedIntent || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Left column — trading-desk fleet panel (Phase 2).
// Four agent cards. Each shows the agent type, its role, and a status indicator
// that flashes "active" when a receipt is emitted, then settles to the agent's
// last-decision color.

import { cn } from '@/lib/utils';
import {
  TRADING_FLEET,
  lastDecisionByType,
  statusFor,
  type AgentStatus,
} from '@/lib/dashboard/fleet';
import type { FeedEntry } from '@/lib/dashboard/feed';

const STATUS_META: Record<AgentStatus, { label: string; dot: string; text: string; accent: string }> = {
  idle: { label: 'Idle', dot: 'bg-zinc-600', text: 'text-zinc-500', accent: 'border-l-zinc-700' },
  active: {
    label: 'Active',
    dot: 'bg-amber-400 animate-pulse',
    text: 'text-amber-300',
    accent: 'border-l-amber-500',
  },
  permit: { label: 'Permit', dot: 'bg-emerald-400', text: 'text-emerald-300', accent: 'border-l-emerald-500' },
  deny: { label: 'Deny', dot: 'bg-red-400', text: 'text-red-300', accent: 'border-l-red-500' },
};

export function FleetPanel({
  entries,
  flashingType,
}: {
  entries: FeedEntry[];
  flashingType: string | null;
}) {
  const lastDecisions = lastDecisionByType(entries);
  return (
    <aside className="flex w-full flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Fleet</div>
        <div className="mt-1 text-sm font-medium text-zinc-100">Trading desk · 4 agents</div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {TRADING_FLEET.map((agent) => (
          <FleetAgentCard
            key={agent.type}
            type={agent.type}
            role={agent.role}
            status={statusFor(agent.type, lastDecisions, flashingType)}
          />
        ))}
      </div>
    </aside>
  );
}

function FleetAgentCard({
  type,
  role,
  status,
}: {
  type: string;
  role: string;
  status: AgentStatus;
}) {
  const meta = STATUS_META[status];
  return (
    <div
      className={cn(
        'border border-l-2 border-zinc-800 bg-zinc-900 px-3 py-3 transition-colors',
        meta.accent,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-medium text-zinc-100">{type}</span>
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', meta.text)}>
          <span className={cn('inline-block size-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-zinc-500">{role}</p>
    </div>
  );
}

// Single-agent card used in the sidebar AGENT slot. ID + status pill + model
// + category + current task. Pure props-in / JSX-out.

import { Copy } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AgentDeclaration } from '@/types';

export type AgentStatus = 'active' | 'idle' | 'review' | 'blocked';

export interface AgentCardProps {
  agent: AgentDeclaration;
  status: AgentStatus;
  category: string;
  currentTask?: string;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  active: 'ACTIVE',
  idle: 'IDLE',
  review: 'REVIEW',
  blocked: 'BLOCKED',
};

const STATUS_CLASS: Record<AgentStatus, string> = {
  active: 'border-emerald-700/60 bg-emerald-500/10 text-emerald-400',
  idle: 'border-zinc-700 bg-zinc-800/40 text-zinc-400',
  review: 'border-amber-700/60 bg-amber-500/10 text-amber-400',
  blocked: 'border-rose-700/60 bg-rose-500/10 text-rose-400',
};

export function AgentCard({ agent, status, category, currentTask }: AgentCardProps) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/40 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="group flex items-center gap-1.5 text-xs font-mono text-zinc-100 hover:text-zinc-300"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(agent.id).catch(() => {});
            }
          }}
          title="Copy agent ID"
        >
          <span>{agent.id}</span>
          <Copy className="size-3 opacity-40 group-hover:opacity-80" />
        </button>
        <span
          className={cn(
            'inline-flex items-center border px-1.5 py-px text-[10px] font-medium tracking-wide',
            STATUS_CLASS[status],
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[11px] leading-tight">
        <Row label="Model" value="gemini-2.5-pro" mono />
        <Row label="Category" value={category} />
      </dl>
      <div className="mt-3 border-t border-zinc-800 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          Current task
        </div>
        <div className="mt-1 text-[12px] text-zinc-200 leading-snug">
          {currentTask ?? <span className="text-zinc-500">—</span>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">{label}</dt>
      <dd className={cn('text-zinc-200', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

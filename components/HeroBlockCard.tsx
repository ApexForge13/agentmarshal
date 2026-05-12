// Hero card — marquee surface for the most recent audit row. Renders status
// pill, fired-rule chips, declared/detected intent panels, and a collapsible
// payload disclosure that shows the raw input Lobster Trap inspected.

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AuditEntry } from '@/types';
import {
  actionBorder,
  actionLabel,
  actionPillClass,
  declaredRows,
  detectedRows,
  detectedSentence,
  entrySummary,
  type IntentRow,
} from '@/lib/dashboard-helpers';

export interface HeroBlockCardProps {
  entry: AuditEntry | null;
}

export function HeroBlockCard({ entry }: HeroBlockCardProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setExpanded(entry.action === 'DENY');
  }, [entry?.id, entry?.action, entry]);

  if (!entry) {
    return (
      <div className="border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
        <p className="text-sm text-zinc-400">
          No activity yet — click{' '}
          <span className="text-zinc-200">Run demo sequence</span> to start.
        </p>
      </div>
    );
  }

  const dotClass =
    entry.action === 'DENY'
      ? 'bg-rose-500'
      : entry.action === 'HUMAN_REVIEW'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div
      className={cn(
        'border border-zinc-800 bg-zinc-900/30 border-l-2',
        actionBorder(entry.action),
      )}
    >
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="relative flex size-2.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                dotClass,
              )}
            />
            <span className={cn('relative inline-flex size-2.5 rounded-full', dotClass)} />
          </span>
          <span
            className={cn(
              'inline-flex items-center border px-2 py-0.5 font-medium tracking-wide',
              actionPillClass(entry.action),
            )}
          >
            {actionLabel(entry.action)}
          </span>
          <span className="font-mono text-zinc-400">{entry.timestamp}</span>
          <span className="text-zinc-300">{entrySummary(entry)}</span>
        </div>

        {entry.rulesFired.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {entry.rulesFired.map((r) => (
              <span
                key={r.name}
                className={cn(
                  'inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-mono',
                  entry.action === 'DENY'
                    ? 'border-rose-700/60 bg-rose-500/5 text-rose-300'
                    : 'border-amber-700/60 bg-amber-500/5 text-amber-300',
                )}
                title={r.description}
              >
                <AlertTriangle className="size-3" />
                <span>{r.flag}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <IntentPanel
            side="declared"
            title="Declared intent"
            subtitle="Operator"
            task={entry.declaredIntent}
            rows={declaredRows(entry)}
          />
          <IntentPanel
            side="detected"
            title="Detected intent"
            subtitle="DPI · Lobster Trap"
            task={detectedSentence(entry)}
            rows={detectedRows(entry)}
          />
        </div>

        <div className="mt-5 border border-zinc-800">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-3 bg-zinc-900/60 px-3 py-2 text-left text-[11px] font-mono text-zinc-400 hover:bg-zinc-900"
          >
            <span className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              <span>
                INBOUND EMAIL · INBOX/MSG-918241 ·
                <span className="text-zinc-500">
                  {' '}
                  imap://comms.cortezroofing.com/INBOX/msg-918241
                </span>
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              Captured by Lobster Trap
            </span>
          </button>
          {expanded && (
            <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300">
                {entry.rawInput ?? '(no raw input captured)'}
              </pre>
              {entry.lobsterTrapMetadata?.contains_injection_patterns && (
                <div className="mt-2 inline-flex items-center gap-1.5 border border-rose-700/60 bg-rose-500/5 px-2 py-1 text-[10px] font-mono text-rose-300">
                  <AlertTriangle className="size-3" />
                  4 patterns matched
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface IntentPanelProps {
  side: 'declared' | 'detected';
  title: string;
  subtitle: string;
  task: string;
  rows: IntentRow[];
}

function IntentPanel({ side, title, subtitle, task, rows }: IntentPanelProps) {
  const border =
    side === 'declared' ? 'border-l-emerald-500' : 'border-l-rose-500';
  return (
    <div
      className={cn(
        'border border-zinc-800 border-l-2 bg-zinc-950/40 px-4 py-3',
        border,
      )}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>{title}</span>
        <span>{subtitle}</span>
      </div>
      <div className="mt-2 text-sm text-zinc-100 leading-snug">{task}</div>
      <dl className="mt-3 space-y-1 text-[11px]">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className="text-zinc-500 uppercase tracking-wider text-[10px]">
              {r.label}
            </dt>
            <dd
              className={cn(
                'font-mono text-zinc-200',
                r.violated &&
                  'text-rose-300 underline decoration-rose-500/60 decoration-dotted underline-offset-4',
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

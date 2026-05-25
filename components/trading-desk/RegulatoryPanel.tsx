// Right column — regulatory state panel (Phase 3).
// Renders an OFAC SDN snapshot. Source-agnostic: it displays whatever the
// RegulatoryStateProvider hands it, so the Bright Data-wired feed is a provider
// swap (server side), not a panel change.

import type { OfacSnapshot } from '@/lib/regulatory/ofac';

const LABEL = 'text-[10px] uppercase tracking-wider text-zinc-500';

export function RegulatoryPanel({ snapshot }: { snapshot: OfacSnapshot }) {
  const live = snapshot.status === 'live';
  return (
    <aside className="flex w-full flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className={LABEL}>Regulatory state</div>
        <div className="mt-1 text-sm font-medium text-zinc-100">Sanctions screening</div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Status</span>
          <span
            className={
              live
                ? 'inline-flex items-center gap-1.5 border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300'
                : 'inline-flex items-center gap-1.5 border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-300'
            }
          >
            <span
              className={`inline-block size-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            {live ? 'Live' : 'Awaiting Bright Data feed'}
          </span>
        </div>

        <Field label="Source" value={snapshot.source} />
        <Field label="Last updated" value={snapshot.last_updated} mono />
        <Field label="Entry count" value={String(snapshot.entry_count)} mono />
        <Field
          label="Fingerprint (sha256)"
          value={`${snapshot.fingerprint.hash.slice(0, 12)}…`}
          mono
        />

        <div>
          <div className={`${LABEL} mb-1.5`}>SDN entries</div>
          <ul className="divide-y divide-zinc-800 border border-zinc-800">
            {snapshot.list.map((entry) => (
              <li key={entry} className="px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
                {entry}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Each trading decision records a fingerprint of the SDN snapshot it was
          screened against — a reader can confirm <span className="text-zinc-400">which</span>{' '}
          list a decision used without embedding the list in every receipt.
        </p>
      </div>
    </aside>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={LABEL}>{label}</span>
      <span className={`text-right text-zinc-200 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
        {value}
      </span>
    </div>
  );
}

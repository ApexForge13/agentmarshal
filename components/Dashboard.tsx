// Mission Control. Single Client Component that owns the polling loop, demo
// trigger button, tab state, and escalation modal. Everything below it is
// pure-render: props in, JSX out.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivityFeed } from '@/components/ActivityFeed';
import { AgentCard, type AgentStatus } from '@/components/AgentCard';
import { AuditLog } from '@/components/AuditLog';
import { EscalationModal } from '@/components/EscalationModal';
import { HeroBlockCard } from '@/components/HeroBlockCard';
import { PolicyEditor } from '@/components/PolicyEditor';
import type { ScenarioKind } from '@/lib/agents/scenarios';
import { agentCategory } from '@/lib/dashboard-helpers';
import { cn } from '@/lib/utils';
import type { Action, AgentDeclaration, AuditEntry } from '@/types';

type TabId = 'activity' | 'audit' | 'policy';

export interface DashboardProps {
  policyYaml: string;
  fleet: AgentDeclaration[];
  ruleCount: number;
  fleetId: string;
  operator: string;
}

const POLL_INTERVAL_MS = 1500;
const AMBIENT_INITIAL_DELAY_MS = 8000;
const AMBIENT_INTERVAL_MS = 10000;
const AMBIENT_ROTATION: ScenarioKind[] = [
  'GREEN',
  'GREEN_INVOICE',
  'GREEN_REVIEW',
  'GREEN_CLAIM',
];
// Hold the hero pinned on the demo's final scenario (the RED BEC block) for
// this long after the demo-trigger fetch resolves. Ambient rotation stays
// paused for the duration so the operator can narrate over a static frame.
const DEMO_DWELL_MS = 90000;
const ACTION_TO_STATUS: Record<Action, AgentStatus> = {
  ALLOW: 'active',
  HUMAN_REVIEW: 'review',
  DENY: 'blocked',
};

export function Dashboard({
  policyYaml,
  fleet,
  ruleCount,
  fleetId,
  operator,
}: DashboardProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [escalationEntry, setEscalationEntry] = useState<AuditEntry | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('activity');
  const [lastReload, setLastReload] = useState<string>(() =>
    new Date().toISOString().replace(/\.\d{3}/, ''),
  );
  const lastEscalatedIdRef = useRef<number | null>(null);
  // Highest audit id present at component mount. Set once after the first
  // poll lands. The auto-open modal effect ignores any HUMAN_REVIEW row at or
  // below this baseline, so historical/seeded escalations don't pop the modal
  // on page load — only escalations from the live demo run do.
  const baselineMaxIdRef = useRef<number | null>(null);
  // Rotation cursor for the ambient GREEN firer. Persists across re-renders
  // and across pauses (demo running → resumed) so we don't reset to the same
  // scenario every time.
  const ambientCursorRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/audit?limit=50', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { entries: AuditEntry[] };
        if (cancelled) return;
        const next = data.entries ?? [];
        if (baselineMaxIdRef.current === null) {
          baselineMaxIdRef.current = next.reduce(
            (m, e) => (e.id > m ? e.id : m),
            0,
          );
        }
        setEntries(next);
        setLastReload(new Date().toISOString().replace(/\.\d{3}/, ''));
      } catch {
        // network blips are fine — next tick retries
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Auto-open the escalation modal when a fresh HUMAN_REVIEW row lands. Gated
  // on baselineMaxIdRef so seeded history never auto-pops on first load.
  useEffect(() => {
    const baseline = baselineMaxIdRef.current;
    if (baseline === null) return;
    const latestReview = entries.find(
      (e) => e.action === 'HUMAN_REVIEW' && e.id > baseline,
    );
    if (!latestReview) return;
    if (lastEscalatedIdRef.current === latestReview.id) return;
    lastEscalatedIdRef.current = latestReview.id;
    const t = setTimeout(() => setEscalationEntry(latestReview), 1000);
    return () => clearTimeout(t);
  }, [entries]);

  // Ambient GREEN rotation. Fires one scenario every AMBIENT_INTERVAL_MS so
  // the activity feed never goes quiet. First fire is delayed by
  // AMBIENT_INITIAL_DELAY_MS so the seeded history is readable before new
  // rows start landing. Paused while the manual demo is running so the demo's
  // hero-card sequence isn't bumped by an ambient row.
  useEffect(() => {
    if (isDemoRunning) return;

    let cancelled = false;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fire() {
      if (cancelled) return;
      const scenario =
        AMBIENT_ROTATION[ambientCursorRef.current % AMBIENT_ROTATION.length];
      ambientCursorRef.current += 1;
      try {
        await fetch('/api/ambient-fire', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenario }),
        });
      } catch {
        // ambient failures are non-fatal — the next tick retries with the
        // next scenario in the rotation
      }
    }

    initialTimer = setTimeout(() => {
      if (cancelled) return;
      void fire();
      intervalId = setInterval(() => void fire(), AMBIENT_INTERVAL_MS);
    }, AMBIENT_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      if (initialTimer) clearTimeout(initialTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isDemoRunning]);

  const featuredEntry = entries[0] ?? null;

  const fleetStatuses = useMemo(() => {
    const map = new Map<string, Action>();
    // Walk newest → oldest; first hit per agentId wins.
    for (const e of entries) {
      if (!map.has(e.agentId)) map.set(e.agentId, e.action);
    }
    return map;
  }, [entries]);

  const activeAgent = useMemo(() => {
    if (!featuredEntry) return fleet[0];
    return fleet.find((a) => a.id === featuredEntry.agentId) ?? fleet[0];
  }, [featuredEntry, fleet]);

  const activeAgentTask = featuredEntry?.declaredIntent;

  const runDemo = useCallback(async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    try {
      await fetch('/api/demo-trigger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delayMs: 15000 }),
      });
      // Hold isDemoRunning true past the last scenario so the hero card stays
      // pinned on RED and ambient rotation doesn't bump it mid-narration.
      await new Promise((resolve) => setTimeout(resolve, DEMO_DWELL_MS));
    } catch {
      // demo failure is non-fatal; surface only via polling
    } finally {
      setIsDemoRunning(false);
    }
  }, [isDemoRunning]);

  return (
    <main className="flex flex-1 flex-col">
      <Header
        operator={operator}
        onRunDemo={runDemo}
        isDemoRunning={isDemoRunning}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          fleet={fleet}
          fleetStatuses={fleetStatuses}
          activeAgent={activeAgent}
          activeAgentTask={activeAgentTask}
        />
        <MainPane
          featuredEntry={featuredEntry}
          entries={entries}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          policyYaml={policyYaml}
          operator={operator}
        />
      </div>
      <Footer fleetId={fleetId} ruleCount={ruleCount} lastReload={lastReload} />
      <EscalationModal
        entry={escalationEntry}
        onApprove={() => setEscalationEntry(null)}
        onDecline={() => setEscalationEntry(null)}
        onClose={() => setEscalationEntry(null)}
      />
    </main>
  );
}

function Header({
  operator,
  onRunDemo,
  isDemoRunning,
}: {
  operator: string;
  onRunDemo: () => void;
  isDemoRunning: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Monogram />
        <span className="text-sm font-semibold tracking-tight">
          AgentMarshal
        </span>
        <span className="hidden text-[11px] text-zinc-500 sm:inline">
          Mission Control
        </span>
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <Pill>DEMO</Pill>
        <Pill>
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500" />
          DPI online
        </Pill>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRunDemo}
          disabled={isDemoRunning}
          className={cn(
            'inline-flex h-8 items-center border border-zinc-700 bg-zinc-100 px-3 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50',
          )}
        >
          {isDemoRunning ? 'Running…' : 'Run demo sequence'}
        </button>
        <span className="font-mono text-[11px] text-zinc-500">{operator}</span>
      </div>
    </header>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium tracking-wider text-zinc-300">
      {children}
    </span>
  );
}

function Monogram() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-zinc-100"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" />
      <path d="M6 18V8l6 6 6-6v10" />
    </svg>
  );
}

function Sidebar({
  fleet,
  fleetStatuses,
  activeAgent,
  activeAgentTask,
}: {
  fleet: AgentDeclaration[];
  fleetStatuses: Map<string, Action>;
  activeAgent: AgentDeclaration | undefined;
  activeAgentTask?: string;
}) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
      <Section title="Agent">
        {activeAgent ? (
          <AgentCard
            agent={activeAgent}
            status={statusFor(activeAgent.id, fleetStatuses)}
            category={agentCategory(activeAgent.id)}
            currentTask={activeAgentTask}
          />
        ) : (
          <div className="px-3 py-3 text-xs text-zinc-500">No agent loaded.</div>
        )}
      </Section>

      <Section title="Fleet">
        <ul className="divide-y divide-zinc-800 border border-zinc-800">
          {fleet.map((a) => {
            const status = statusFor(a.id, fleetStatuses);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 px-3 py-2 text-[11px]"
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    statusDot(status),
                  )}
                />
                <span className="font-mono text-zinc-200 truncate w-24">
                  {a.id}
                </span>
                <span className="ml-auto text-zinc-500 truncate text-right">
                  {a.name}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Monthly cap">
        <BudgetGauge
          label="LLM tokens"
          used={43.96}
          cap={150}
          tone="ok"
        />
        <BudgetGauge label="SMS sends" used={80} cap={250} tone="warn" />
        <BudgetGauge label="Buffer" used={3.47} cap={100} tone="ok" />
        <div className="mt-3 flex items-baseline justify-between border-t border-zinc-800 pt-2 text-[11px]">
          <span className="uppercase tracking-wider text-zinc-500">
            Used / cap
          </span>
          <span className="font-mono text-zinc-200">$127.43 / $500.00</span>
        </div>
      </Section>
    </aside>
  );
}

function statusFor(
  id: string,
  map: Map<string, Action>,
): AgentStatus {
  const action = map.get(id);
  if (!action) return 'idle';
  return ACTION_TO_STATUS[action];
}

function statusDot(status: AgentStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'review':
      return 'bg-amber-500';
    case 'blocked':
      return 'bg-rose-500';
    default:
      return 'bg-zinc-600';
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-800 px-4 py-4">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function BudgetGauge({
  label,
  used,
  cap,
  tone,
}: {
  label: string;
  used: number;
  cap: number;
  tone: 'ok' | 'warn' | 'over';
}) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const bar =
    tone === 'over'
      ? 'bg-rose-500'
      : tone === 'warn'
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">
          ${used.toFixed(2)} / ${cap.toFixed(0)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-zinc-800">
        <div className={cn('h-full', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MainPane({
  featuredEntry,
  entries,
  activeTab,
  onTabChange,
  policyYaml,
  operator,
}: {
  featuredEntry: AuditEntry | null;
  entries: AuditEntry[];
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  policyYaml: string;
  operator: string;
}) {
  const headerAgent = featuredEntry?.agentId ?? '—';
  const headerTs =
    featuredEntry?.timestamp ?? new Date().toISOString().replace(/\.\d{3}/, '');

  return (
    <section className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Mission Control
            </div>
            <div className="mt-1 font-mono text-3xl text-zinc-100">
              {headerAgent}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-zinc-500">
            {headerTs} · operator {operator}
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <HeroBlockCard entry={featuredEntry} />
      </div>

      <div className="border-t border-zinc-800">
        <div className="flex items-center gap-1 border-b border-zinc-800 px-6">
          <TabButton
            active={activeTab === 'activity'}
            onClick={() => onTabChange('activity')}
          >
            Live activity
          </TabButton>
          <TabButton
            active={activeTab === 'audit'}
            onClick={() => onTabChange('audit')}
          >
            Audit log
          </TabButton>
          <TabButton
            active={activeTab === 'policy'}
            onClick={() => onTabChange('policy')}
          >
            Policy YAML
          </TabButton>
          <div className="ml-auto py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {entries.length} rows · live
          </div>
        </div>
        <div>
          {activeTab === 'activity' && <ActivityFeed entries={entries} />}
          {activeTab === 'audit' && <AuditLog entries={entries} />}
          {activeTab === 'policy' && <PolicyEditor yaml={policyYaml} />}
        </div>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2.5 text-xs font-medium tracking-wide transition-colors',
        active
          ? 'border-zinc-100 text-zinc-100'
          : 'border-transparent text-zinc-500 hover:text-zinc-300',
      )}
    >
      {children}
    </button>
  );
}

function Footer({
  fleetId,
  ruleCount,
  lastReload,
}: {
  fleetId: string;
  ruleCount: number;
  lastReload: string;
}) {
  return (
    <footer className="sticky bottom-0 z-30 flex h-10 items-center justify-between border-t border-zinc-800 bg-zinc-950/95 px-5 font-mono text-[11px] text-zinc-500 backdrop-blur-sm">
      <span>
        AgentMarshal v0.1.0 · Policy {fleetId} · {ruleCount} rules active
      </span>
      <span>Last reload {lastReload}</span>
    </footer>
  );
}

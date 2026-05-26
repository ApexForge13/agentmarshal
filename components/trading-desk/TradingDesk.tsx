'use client';

// Trading-desk dashboard (Bubble 16 — three-state + ambient feed + custom input).
//
// Owns the demo runner, the ambient simulation loop, agent flash/fresh timing,
// the metrics, and the right-rail mode. Every firing — ambient, "Run demo
// sequence", or the custom counterparty screen — goes through the REAL
// /api/access/v1/evaluation endpoint (no setContractOverride), so every feed row
// is a genuine signed + timestamped record. The feed lives in the session-scoped
// singleton store (lib/dashboard/feed-store.ts) so /audit-trail sees the same
// stream. The ambient loop makes the dashboard feel alive when loaded cold: most
// firings clear green, ~15% flag yellow for review, ~5% are red SDN hits.

import { useCallback, useEffect, useRef, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { MetricsStrip, type Metric } from '@/components/shell/MetricsStrip';
import { FleetStrip } from './FleetStrip';
import { ActivityFeed } from './ActivityFeed';
import { RegulatoryPanel } from './RegulatoryPanel';
import { ReceiptRail } from './ReceiptRail';
import {
  useReceiptFeed,
  fireScenario,
  makeFeedEntry,
  decisionBreakdown,
  type FeedEntry,
} from '@/lib/dashboard/feed';
import { sharedFeed } from '@/lib/dashboard/feed-store';
import { selectAmbientScenario, jitterDelay } from '@/lib/dashboard/ambient-scenarios';
import type { DemoScenario } from '@/lib/dashboard/demo-scenarios';
import type { OfacSnapshot } from '@/lib/regulatory/ofac';
import type { AuthZenRequest } from '@/types/authzen';

// Demo burst: 850ms between firings so each row visibly settles. Flash + fresh
// windows are shorter so a card settles before the next.
const RUN_DELAY_MS = 850;
const FLASH_MS = 550;
const FRESH_MS = 1500;
const EVAL_SAMPLE_CAP = 50; // rolling window for the avg-eval-time metric

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function TradingDesk({
  snapshot,
  demoScenarios,
}: {
  snapshot: OfacSnapshot;
  demoScenarios: DemoScenario[];
}) {
  const entries = useReceiptFeed(sharedFeed);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<FeedEntry | null>(null);
  const [flashingType, setFlashingType] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [evalMs, setEvalMs] = useState<number[]>([]);
  const [customEntity, setCustomEntity] = useState('');
  const [screening, setScreening] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pauses the ambient loop during a demo burst / custom screen so the focused
  // firings are not interleaved with background traffic. A ref so toggling it
  // never re-runs the ambient effect.
  const ambientPaused = useRef(false);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (freshTimer.current) clearTimeout(freshTimer.current);
    };
  }, []);

  const flash = useCallback((type: string) => {
    setFlashingType(type);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashingType(null), FLASH_MS);
  }, []);

  const markFresh = useCallback((id: string) => {
    setFreshId(id);
    if (freshTimer.current) clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFreshId(null), FRESH_MS);
  }, []);

  // Fire one request through the real PDP, append the signed record to the shared
  // feed, and run the flash/fresh/eval-timing UI. Stable identity (no reactive
  // deps) so the ambient effect mounts exactly once.
  const fireAndAppend = useCallback(
    async (request: AuthZenRequest): Promise<FeedEntry> => {
      const t0 = performance.now();
      const res = await fireScenario(request);
      const dt = performance.now() - t0;
      const entry = makeFeedEntry(request, res);
      sharedFeed.append(entry);
      setEvalMs((prev) => [...prev, dt].slice(-EVAL_SAMPLE_CAP));
      markFresh(entry.id);
      flash(request.subject.type);
      return entry;
    },
    [flash, markFresh],
  );

  // Ambient loop: jittered self-scheduling timeout. Cancellation-on-cleanup makes
  // it React-Strict-Mode-safe — the dev double-mount clears the first loop before
  // the second starts, so only one loop ever survives (no double-firing). Skips
  // firing while the tab is hidden (Page Visibility) or a demo/custom run holds it.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      timer = setTimeout(tick, jitterDelay());
    };

    const tick = async () => {
      if (cancelled) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!hidden && !ambientPaused.current) {
        try {
          await fireAndAppend(selectAmbientScenario().request);
        } catch {
          // A transient endpoint error must not kill the loop — just try again next tick.
        }
      }
      scheduleNext();
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fireAndAppend]);

  const runDemo = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setSelected(null);
    ambientPaused.current = true; // pause ambient for the focused burst
    try {
      for (const scenario of demoScenarios) {
        await fireAndAppend(scenario.request);
        await delay(RUN_DELAY_MS);
      }
    } catch {
      // A mid-sequence failure leaves the partial feed visible; operator re-runs.
    } finally {
      ambientPaused.current = false; // resume ambient
      setRunning(false);
    }
  }, [running, demoScenarios, fireAndAppend]);

  const screenCustom = useCallback(async () => {
    const id = customEntity.trim();
    if (!id || screening) return;
    setScreening(true);
    ambientPaused.current = true;
    try {
      await fireAndAppend({
        subject: { type: 'ExecutionAgent', id: 'execution-agent-custom' },
        action: {
          name: 'execute_trade',
          properties: {
            regulatory_state: { ofac_sdn_list: snapshot.list },
            entity: { id },
          },
        },
        resource: { type: 'counterparty', id },
      });
      setCustomEntity('');
    } catch {
      // Surfacing nothing is fine — the row simply does not appear; operator retries.
    } finally {
      ambientPaused.current = false;
      setScreening(false);
    }
  }, [customEntity, screening, snapshot.list, fireAndAppend]);

  const breakdown = decisionBreakdown(entries);
  const activeAgents = new Set(entries.map((e) => e.agentType)).size;
  const avgEval = evalMs.length
    ? `${Math.round(evalMs.reduce((a, b) => a + b, 0) / evalMs.length)}ms`
    : '—';

  const metrics: Metric[] = [
    { label: 'Decisions today', value: String(entries.length) },
    { label: 'Yellow flags', value: String(breakdown.review), tone: breakdown.review > 0 ? 'warning' : 'default' },
    { label: 'Hits caught', value: String(breakdown.deny), tone: breakdown.deny > 0 ? 'danger' : 'default' },
    { label: 'Avg eval time', value: avgEval },
    { label: 'Active agents', value: String(activeAgents) },
    { label: 'Audit chain length', value: String(entries.length) },
  ];

  return (
    <AppShell notify={breakdown.deny > 0}>
      <div className="page">
        <div
          className="page-main"
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div className="page-header">
            <div>
              <h1 className="page-title">Trading Desk</h1>
              <div className="page-sub">v0.2 · 4 agents · OFAC sanctions screening</div>
            </div>
            <div className="page-actions">
              <button type="button" className="btn primary" onClick={runDemo} disabled={running}>
                {running ? 'Running…' : 'Run demo sequence'}
              </button>
            </div>
          </div>

          <MetricsStrip metrics={metrics} />
          <FleetStrip entries={entries} flashingType={flashingType} />

          <div
            className="field"
            style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', gap: 6 }}
          >
            <span className="field-label">Test a counterparty against the SDN list</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                value={customEntity}
                onChange={(e) => setCustomEntity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void screenCustom();
                }}
                placeholder="ENT-EXAMPLE-CORP-001 or SYN-SDN-IRAN-MARITIME-001"
                style={{ maxWidth: 420 }}
                aria-label="Counterparty entity id"
              />
              <button
                type="button"
                className="btn primary"
                onClick={() => void screenCustom()}
                disabled={!customEntity.trim() || screening}
              >
                {screening ? 'Screening…' : 'Screen'}
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Fires execute_trade through ExecutionAgent. Clean → permit. Substring match (IRAN,
              CRIMEA, DPRK) → review. SDN exact match → deny.
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <ActivityFeed
              entries={entries}
              selectedId={selected?.id ?? null}
              freshId={freshId}
              onSelect={setSelected}
            />
          </div>
        </div>

        <div className="page-rail">
          {selected ? (
            <ReceiptRail entry={selected} onClose={() => setSelected(null)} />
          ) : (
            <RegulatoryPanel snapshot={snapshot} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

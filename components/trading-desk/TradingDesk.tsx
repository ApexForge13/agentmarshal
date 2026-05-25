'use client';

// Trading-desk dashboard (Bubble 15) — Echo OS design language over the Bubble 14
// behavior. Owns the activity-feed source, the demo runner (with client-side eval
// timing), agent flash timing, the metrics, and the right-rail mode. "Run demo
// sequence" fires the four trading scenarios through the REAL
// /api/access/v1/evaluation endpoint (Phase 0 subject.type resolver; no
// setContractOverride) — every feed row is a genuine signed + timestamped record.
// Pure chrome change vs Bubble 14: identical evaluation/feed/verify behavior.

import { useCallback, useEffect, useRef, useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { MetricsStrip, type Metric } from '@/components/shell/MetricsStrip';
import { FleetStrip } from './FleetStrip';
import { ActivityFeed } from './ActivityFeed';
import { RegulatoryPanel } from './RegulatoryPanel';
import { ReceiptRail } from './ReceiptRail';
import {
  InMemoryReceiptFeedSource,
  useReceiptFeed,
  fireScenario,
  makeFeedEntry,
  type FeedEntry,
} from '@/lib/dashboard/feed';
import type { DemoScenario } from '@/lib/dashboard/demo-scenarios';
import type { OfacSnapshot } from '@/lib/regulatory/ofac';

// Spec Phase 6: 500–1000ms between firings so the feed visibly populates one row
// at a time. Flash + fresh windows are shorter so a card settles before the next.
const RUN_DELAY_MS = 850;
const FLASH_MS = 550;
const FRESH_MS = 1500;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function TradingDesk({
  snapshot,
  demoScenarios,
}: {
  snapshot: OfacSnapshot;
  demoScenarios: DemoScenario[];
}) {
  const [feed] = useState(() => new InMemoryReceiptFeedSource());
  const entries = useReceiptFeed(feed);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<FeedEntry | null>(null);
  const [flashingType, setFlashingType] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [evalMs, setEvalMs] = useState<number[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const runDemo = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setSelected(null);
    setEvalMs([]);
    feed.clear();
    try {
      for (const scenario of demoScenarios) {
        const t0 = performance.now();
        const res = await fireScenario(scenario.request);
        const dt = performance.now() - t0;
        const entry = makeFeedEntry(scenario.request, res);
        feed.append(entry);
        setEvalMs((prev) => [...prev, dt]);
        markFresh(entry.id);
        flash(scenario.request.subject.type);
        await delay(RUN_DELAY_MS);
      }
    } catch {
      // A mid-sequence failure leaves the partial feed visible; operator re-runs.
    } finally {
      setRunning(false);
    }
  }, [running, feed, demoScenarios, flash, markFresh]);

  const denies = entries.filter((e) => e.decision === 'deny').length;
  const activeAgents = new Set(entries.map((e) => e.agentType)).size;
  const avgEval = evalMs.length
    ? `${Math.round(evalMs.reduce((a, b) => a + b, 0) / evalMs.length)}ms`
    : '—';

  const metrics: Metric[] = [
    { label: 'Decisions today', value: String(entries.length) },
    // Three-state (review) lands in Bubble 16; warning tone is reserved for when
    // this starts populating.
    { label: 'Yellow flags', value: '0' },
    { label: 'Hits caught', value: String(denies), tone: denies > 0 ? 'danger' : 'default' },
    { label: 'Avg eval time', value: avgEval },
    { label: 'Active agents', value: String(activeAgents) },
    { label: 'Audit chain length', value: String(entries.length) },
  ];

  return (
    <AppShell notify={denies > 0}>
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

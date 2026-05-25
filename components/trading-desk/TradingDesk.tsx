'use client';

// Trading-desk dashboard (Bubble 14) — the v0.2 replacement for the v0.1
// mike-cortez Mission Control at demo.agentmarshal.dev.
//
// Owns the activity-feed source, the demo runner, agent-card flash timing, and
// the receipt viewer. The "Run demo sequence" trigger fires the four trading
// scenarios through the REAL /api/access/v1/evaluation endpoint (Phase 0
// subject.type resolver; no setContractOverride), so every row in the feed is a
// genuine signed + timestamped record.

import { useCallback, useEffect, useRef, useState } from 'react';

import { FleetPanel } from './FleetPanel';
import { ActivityFeed } from './ActivityFeed';
import { RegulatoryPanel } from './RegulatoryPanel';
import { ReceiptViewer } from './ReceiptViewer';
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
// at a time. Flash window is shorter so the card settles to its decision color
// before the next firing.
const RUN_DELAY_MS = 850;
const FLASH_MS = 550;

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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const flash = useCallback((type: string) => {
    setFlashingType(type);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashingType(null), FLASH_MS);
  }, []);

  const runDemo = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setSelected(null);
    feed.clear();
    try {
      for (const scenario of demoScenarios) {
        const res = await fireScenario(scenario.request);
        feed.append(makeFeedEntry(scenario.request, res));
        flash(scenario.request.subject.type);
        await delay(RUN_DELAY_MS);
      }
    } catch {
      // A mid-sequence failure leaves the partial feed visible; the operator can
      // re-run. Nothing to surface beyond the rows that did land.
    } finally {
      setRunning(false);
    }
  }, [running, feed, demoScenarios, flash]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-5 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">AgentMarshal</span>
          <span className="text-[11px] text-zinc-500">Trading desk</span>
        </div>
        <button
          type="button"
          onClick={runDemo}
          disabled={running}
          className="inline-flex h-8 items-center bg-zinc-100 px-3.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run demo sequence'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="w-72 shrink-0 overflow-y-auto">
          <FleetPanel entries={entries} flashingType={flashingType} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <ActivityFeed
            entries={entries}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        </div>
        <div className="w-80 shrink-0 overflow-y-auto">
          <RegulatoryPanel snapshot={snapshot} />
        </div>
      </div>

      {selected && <ReceiptViewer entry={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

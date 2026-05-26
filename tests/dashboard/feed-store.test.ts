// Session-scoped singleton feed store (Bubble 16).
// Proves the lifted store notifies multiple independent subscribers off one shared
// instance — the property that lets / write and /audit-trail read the same stream.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sharedFeed, sessionStartedAt } from '@/lib/dashboard/feed-store';
import type { FeedEntry } from '@/lib/dashboard/feed';

function entry(id: string): FeedEntry {
  return {
    id,
    issuedAt: '2026-05-26T12:00:00Z',
    agentType: 'TradingAgent',
    agentId: 'trading-agent-001',
    actionName: 'propose_trade',
    entityId: 'ENT-CLEAN-001',
    decision: 'permit',
    reviewReason: null,
    compositeSummary: 'entity_not_sanctioned: pass',
    record: null,
  };
}

describe('shared feed store (Bubble 16 singleton)', () => {
  // Isolate: the store is module-level and persists across tests in this file.
  beforeEach(() => sharedFeed.clear());

  it('notifies every subscriber of an append off one shared instance', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = sharedFeed.subscribe(a);
    const unsubB = sharedFeed.subscribe(b);

    sharedFeed.append(entry('e1'));

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(sharedFeed.list().map((e) => e.id)).toEqual(['e1']);

    unsubA();
    unsubB();
  });

  it('stops notifying after unsubscribe; newest-first ordering holds', () => {
    const listener = vi.fn();
    const unsub = sharedFeed.subscribe(listener);
    sharedFeed.append(entry('e1'));
    sharedFeed.append(entry('e2'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(sharedFeed.list().map((e) => e.id)).toEqual(['e2', 'e1']);

    unsub();
    sharedFeed.append(entry('e3'));
    expect(listener).toHaveBeenCalledTimes(2); // no further notifications
    expect(sharedFeed.list().map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('exposes a stable session start timestamp', () => {
    expect(sessionStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

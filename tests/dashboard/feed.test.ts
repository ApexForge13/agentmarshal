// Activity-feed data layer (Bubble 14, Phase 4).
// In-memory feed source + record-shape normalizers + composite one-liner.

import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryReceiptFeedSource,
  extractComposites,
  compositeSummary,
  makeFeedEntry,
  type FeedEntry,
  type SignedRecord,
} from '@/lib/dashboard/feed';
import type { AuthZenRequest } from '@/types/authzen';

function entry(agentType: string): FeedEntry {
  return {
    id: `${agentType}-${Math.random()}`,
    issuedAt: '2026-05-24T17:00:00Z',
    agentType,
    agentId: 'x',
    actionName: 'a',
    entityId: null,
    decision: 'permit',
    compositeSummary: '',
    record: null,
  };
}

describe('InMemoryReceiptFeedSource', () => {
  it('appends newest-first', () => {
    const src = new InMemoryReceiptFeedSource();
    src.append(entry('A'));
    src.append(entry('B'));
    expect(src.list().map((e) => e.agentType)).toEqual(['B', 'A']);
  });

  it('caps at capacity, dropping the oldest', () => {
    const src = new InMemoryReceiptFeedSource(3);
    for (const t of ['A', 'B', 'C', 'D', 'E']) src.append(entry(t));
    expect(src.list().map((e) => e.agentType)).toEqual(['E', 'D', 'C']);
    expect(src.list()).toHaveLength(3);
  });

  it('notifies subscribers on append and clear, and stops after unsubscribe', () => {
    const src = new InMemoryReceiptFeedSource();
    const listener = vi.fn();
    const unsub = src.subscribe(listener);
    src.append(entry('A'));
    src.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    src.append(entry('B'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clear empties the feed; clearing an empty feed is a no-op (no notify)', () => {
    const src = new InMemoryReceiptFeedSource();
    const listener = vi.fn();
    src.subscribe(listener);
    src.clear();
    expect(listener).not.toHaveBeenCalled();
    src.append(entry('A'));
    src.clear();
    expect(src.list()).toHaveLength(0);
  });

  it('returns a referentially stable snapshot between mutations', () => {
    const src = new InMemoryReceiptFeedSource();
    src.append(entry('A'));
    expect(src.list()).toBe(src.list());
    const before = src.list();
    src.append(entry('B'));
    expect(src.list()).not.toBe(before);
  });
});

describe('extractComposites — record-type agnostic', () => {
  const composites = [{ predicate: 'entity_not_sanctioned', result: 'pass' }];

  it('reads top-level composite_evaluations (Compliance Receipt)', () => {
    const rec = { composite_evaluations: composites } as unknown as SignedRecord;
    expect(extractComposites(rec)).toEqual(composites);
  });

  it('reads evaluation.composite_evaluations (Internal Audit)', () => {
    const rec = { evaluation: { composite_evaluations: composites } } as unknown as SignedRecord;
    expect(extractComposites(rec)).toEqual(composites);
  });

  it('returns [] for a record with neither, and for null', () => {
    expect(extractComposites({} as SignedRecord)).toEqual([]);
    expect(extractComposites(null)).toEqual([]);
  });
});

describe('compositeSummary', () => {
  it('formats pass', () => {
    expect(compositeSummary([{ predicate: 'entity_not_sanctioned', result: 'pass' }])).toBe(
      'entity_not_sanctioned: pass',
    );
  });

  it('formats fail with the matched entry', () => {
    expect(
      compositeSummary([
        {
          predicate: 'entity_not_sanctioned',
          result: 'fail',
          details: { matched_entry: 'SYN-SDN-IRAN-MARITIME-001' },
        },
      ]),
    ).toBe('entity_not_sanctioned: fail (matched SYN-SDN-IRAN-MARITIME-001)');
  });

  it('formats fail without a matched entry, and stub as unresolved', () => {
    expect(compositeSummary([{ predicate: 'p', result: 'fail' }])).toBe('p: fail');
    expect(compositeSummary([{ predicate: 'p', result: 'stub' }])).toBe('p: unresolved');
  });

  it('reports the empty case', () => {
    expect(compositeSummary([])).toBe('no composite checks');
  });
});

describe('makeFeedEntry', () => {
  const req: AuthZenRequest = {
    subject: { type: 'ExecutionAgent', id: 'execution-agent-001' },
    action: {
      name: 'execute_trade',
      properties: { entity: { id: 'SYN-SDN-IRAN-MARITIME-001' } },
    },
    resource: { type: 'counterparty', id: 'SYN-SDN-IRAN-MARITIME-001' },
  };

  it('maps a deny response with a failing composite (Internal Audit shape)', () => {
    const e = makeFeedEntry(req, {
      decision: false,
      record: {
        record_type: 'internal_audit',
        issued_at: '2026-05-24T17:30:00Z',
        evaluation: {
          composite_evaluations: [
            {
              predicate: 'entity_not_sanctioned',
              result: 'fail',
              details: { matched_entry: 'SYN-SDN-IRAN-MARITIME-001' },
            },
          ],
        },
      } as unknown as SignedRecord,
    });
    expect(e.agentType).toBe('ExecutionAgent');
    expect(e.agentId).toBe('execution-agent-001');
    expect(e.actionName).toBe('execute_trade');
    expect(e.entityId).toBe('SYN-SDN-IRAN-MARITIME-001');
    expect(e.decision).toBe('deny');
    expect(e.issuedAt).toBe('2026-05-24T17:30:00Z');
    expect(e.compositeSummary).toBe(
      'entity_not_sanctioned: fail (matched SYN-SDN-IRAN-MARITIME-001)',
    );
  });

  it('handles a missing record (falls back to client time, no composites)', () => {
    const e = makeFeedEntry(req, { decision: true });
    expect(e.decision).toBe('permit');
    expect(e.record).toBeNull();
    expect(typeof e.issuedAt).toBe('string');
    expect(e.compositeSummary).toBe('no composite checks');
  });
});

// Activity-feed data layer for the trading-desk dashboard (Phases 4 + 6).
//
// A feed entry is born when a scenario fires and the real evaluation response
// comes back. It carries the display fields we KNOW from the request we sent
// (agent type/id, action, screened entity) plus the signed record returned by
// the endpoint (re-verified on demand in the receipt viewer). The feed never
// re-derives trust from the record's fields — it displays and re-checks it.
//
// The feed's data source is a swappable provider (ReceiptFeedSource): v0.2 ships
// an in-memory source fed by the demo runner; a future persistence / SSE source
// implements the same interface, so wiring persistence is a swap, not a rewrite.

import { useSyncExternalStore } from 'react';
import type { AuthZenRequest } from '@/types/authzen';

// The signed record as it rides the evaluation response: a record_type
// discriminator plus the Compliance Receipt or Internal Audit body.
export type SignedRecord = Record<string, unknown> & { record_type?: string };

export interface EvaluationResponse {
  decision: boolean;
  context?: Record<string, unknown>;
  record?: SignedRecord;
}

export type FeedDecision = 'permit' | 'deny';

export interface FeedEntry {
  /** Stable per-emission id. */
  id: string;
  /** Real receipt issuance time (ISO); falls back to client time if absent. */
  issuedAt: string;
  agentType: string;
  agentId: string;
  actionName: string;
  entityId: string | null;
  decision: FeedDecision;
  /** e.g. "entity_not_sanctioned: fail (matched SYN-SDN-IRAN-MARITIME-001)". */
  compositeSummary: string;
  record: SignedRecord | null;
}

interface CompositeEval {
  predicate: string;
  result: string; // 'pass' | 'fail' | 'stub'
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Composite evaluations live at the record top level for Compliance Receipts and
 * under `evaluation` for Internal Audit envelopes. Trading agents emit Internal
 * Audit records (their type is outside the customer-touching set), so the nested
 * path is the live one — but we read both so the feed is record-type agnostic.
 */
export function extractComposites(record: SignedRecord | null | undefined): CompositeEval[] {
  if (!record) return [];
  const top = record['composite_evaluations'];
  if (Array.isArray(top)) return top as CompositeEval[];
  const evalBlock = record['evaluation'];
  if (evalBlock && typeof evalBlock === 'object') {
    const nested = (evalBlock as Record<string, unknown>)['composite_evaluations'];
    if (Array.isArray(nested)) return nested as CompositeEval[];
  }
  return [];
}

/** One-liner per Phase 4: `<predicate>: pass | fail (matched …) | unresolved`. */
export function compositeSummary(composites: CompositeEval[]): string {
  if (composites.length === 0) return 'no composite checks';
  return composites
    .map((c) => {
      if (c.result === 'fail') {
        const matched = c.details?.['matched_entry'];
        return typeof matched === 'string'
          ? `${c.predicate}: fail (matched ${matched})`
          : `${c.predicate}: fail`;
      }
      if (c.result === 'stub') return `${c.predicate}: unresolved`;
      return `${c.predicate}: ${c.result}`;
    })
    .join(' · ');
}

function readEntityId(req: AuthZenRequest): string | null {
  const props = req.action.properties as Record<string, unknown> | undefined;
  const entity = props?.['entity'];
  if (entity && typeof entity === 'object') {
    const id = (entity as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  return null;
}

function freshId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `fe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Combine the request we sent with the evaluation response into a feed entry. */
export function makeFeedEntry(req: AuthZenRequest, res: EvaluationResponse): FeedEntry {
  const record = res.record ?? null;
  const issuedAt = (record?.['issued_at'] as string | undefined) ?? new Date().toISOString();
  return {
    id: freshId(),
    issuedAt,
    agentType: req.subject.type,
    agentId: req.subject.id,
    actionName: req.action.name,
    entityId: readEntityId(req),
    decision: res.decision ? 'permit' : 'deny',
    compositeSummary: compositeSummary(extractComposites(record)),
    record,
  };
}

/** Fire one AuthZEN request through the real PDP endpoint (no override). */
export async function fireScenario(request: AuthZenRequest): Promise<EvaluationResponse> {
  const res = await fetch('/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return (await res.json()) as EvaluationResponse;
}

// --- Swappable feed source ---------------------------------------------------

export interface ReceiptFeedSource {
  readonly capacity: number;
  list(): FeedEntry[];
  append(entry: FeedEntry): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_CAPACITY = 50;

/** In-memory feed: newest-first, capped at `capacity` (older entries scroll off). */
export class InMemoryReceiptFeedSource implements ReceiptFeedSource {
  readonly capacity: number;
  private entries: FeedEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  list(): FeedEntry[] {
    return this.entries;
  }

  append(entry: FeedEntry): void {
    this.entries = [entry, ...this.entries].slice(0, this.capacity);
    this.emit();
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

/** Subscribe a component to a feed source. Stable snapshot between appends. */
export function useReceiptFeed(source: ReceiptFeedSource): FeedEntry[] {
  return useSyncExternalStore(
    (cb) => source.subscribe(cb),
    () => source.list(),
    () => source.list(),
  );
}

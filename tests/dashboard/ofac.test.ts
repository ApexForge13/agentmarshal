// OFAC regulatory-state provider (Bubble 14, Phase 3).
// Snapshot shape + the fingerprint drift-lock: the panel's fingerprint MUST equal
// the one the entity_not_sanctioned composite stamps into each receipt, so a
// reader comparing the panel to a receipt sees the same snapshot id.

import { describe, it, expect } from 'vitest';
import { getOfacSnapshot, fingerprintSdnList } from '@/lib/regulatory/ofac';
import { entityNotSanctionedPredicate } from '@/lib/compliance/predicates/trading/entity-not-sanctioned';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';

describe('getOfacSnapshot', () => {
  it('returns the v0.2 fixture snapshot awaiting the Bright Data feed', () => {
    const snap = getOfacSnapshot();
    expect(snap.source).toBe('OFAC SDN List');
    expect(snap.status).toBe('awaiting_feed');
    expect(snap.entry_count).toBe(snap.list.length);
    expect(snap.entry_count).toBe(3);
    expect(snap.fingerprint.algo).toBe('sha256');
    expect(snap.fingerprint.length).toBe(3);
    expect(snap.fingerprint.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('fingerprintSdnList', () => {
  it('is order-independent (canonical ascending sort)', () => {
    const a = fingerprintSdnList(['c', 'a', 'b']);
    const b = fingerprintSdnList(['b', 'c', 'a']);
    expect(a.hash).toBe(b.hash);
  });
});

describe('fingerprint drift-lock: panel ↔ receipt composite', () => {
  it('the snapshot fingerprint equals the entity_not_sanctioned composite fingerprint', async () => {
    const snap = getOfacSnapshot();
    const ctx: EvalContext = {
      now: new Date(),
      tenant_id: 'default',
      agent_id: 'test',
      request_id: 'test',
      audit: NULL_EMITTER,
      action_properties: {
        regulatory_state: { ofac_sdn_list: snap.list },
        entity: { id: 'ENT-CLEAN-NOT-SANCTIONED' },
      },
    };
    const outcome = await entityNotSanctionedPredicate.evaluate({}, ctx);
    expect(outcome.result).toBe('pass');
    const fp = (outcome.details as { sdn_list_fingerprint?: { hash?: string } })
      .sdn_list_fingerprint;
    expect(fp?.hash).toBe(snap.fingerprint.hash);
  });
});

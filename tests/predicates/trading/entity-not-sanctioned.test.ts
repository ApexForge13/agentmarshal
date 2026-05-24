import { describe, it, expect, beforeEach } from 'vitest';
import { entityNotSanctionedPredicate } from '../../../lib/compliance/predicates/trading/entity-not-sanctioned';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

const PRED = 'entity_not_sanctioned';

// Shared synthetic SDN list (matches the Bubble 13 seed scenarios). No real OFAC
// entities encoded; the SYN- prefix marks them synthetic.
const SDN_LIST = [
  'SYN-SDN-IRAN-MARITIME-001',
  'SYN-SDN-CRIMEA-BANK-007',
  'SYN-SDN-DPRK-TRADING-042',
];

function makeCtx(actionProperties?: Record<string, unknown>): EvalContext {
  return {
    now: new Date('2026-05-24T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'execution-agent-001',
    request_id: 'r',
    audit: NULL_EMITTER,
    action_properties: actionProperties,
  };
}

describe('trading entity_not_sanctioned predicate (Bubble 13 real / OFAC PRE-scaffold)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(entityNotSanctionedPredicate);
  });

  it('registers under the expected name', () => {
    const p = getComposite(PRED);
    expect(p).toBeDefined();
    expect(p?.name).toBe(PRED);
  });

  // Block 1 — positive: clean entity passes against a populated list; the receipt
  // records the SDN snapshot fingerprint and the entity.id checked.
  it("returns 'pass' for a clean entity against a populated list and records the fingerprint + entity.id", async () => {
    const result = await entityNotSanctionedPredicate.evaluate(
      {},
      makeCtx({
        regulatory_state: { ofac_sdn_list: SDN_LIST },
        entity: { id: 'ENT-DTCC-PARTICIPANT-1234' },
      }),
    );
    expect(result.result).toBe('pass');
    expect(result.details.entity_id).toBe('ENT-DTCC-PARTICIPANT-1234');
    expect(result.details.matched_entry).toBeNull();
    const fp = result.details.sdn_list_fingerprint as { algo: string; hash: string; length: number };
    expect(fp.algo).toBe('sha256');
    expect(fp.length).toBe(3);
    expect(fp.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isAllowable([result])).toBe(true);
  });

  // Block 2 — negative: a sanctioned entity fails; the receipt records the matched
  // entry and the same snapshot fingerprint.
  it("returns 'fail' for a sanctioned entity and records the matched entry + fingerprint", async () => {
    const result = await entityNotSanctionedPredicate.evaluate(
      {},
      makeCtx({
        regulatory_state: { ofac_sdn_list: SDN_LIST },
        entity: { id: 'SYN-SDN-IRAN-MARITIME-001' },
      }),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/SDN list/i);
    expect(result.details.entity_id).toBe('SYN-SDN-IRAN-MARITIME-001');
    expect(result.details.matched_entry).toBe('SYN-SDN-IRAN-MARITIME-001');
    const fp = result.details.sdn_list_fingerprint as { length: number };
    expect(fp.length).toBe(3);
    expect(isAllowable([result])).toBe(false);
  });

  // Block 3 — unresolved: an absent runtime input yields the 'stub' sentinel that
  // blocks allow and records the missing input for the "waiting on regulatory
  // feed" dashboard state. Two cases under one describe.
  describe("returns 'stub' (unresolved) when a runtime input is absent", () => {
    it('missing SDN list → unresolved, records the missing input and blocks allow', async () => {
      const result = await entityNotSanctionedPredicate.evaluate(
        {},
        makeCtx({ entity: { id: 'ENT-DTCC-PARTICIPANT-1234' } }),
      );
      expect(result.result).toBe('stub');
      expect(result.details.unresolved).toBe(true);
      expect(result.details.missing).toEqual(['regulatory_state.ofac_sdn_list']);
      expect(result.reason).toMatch(/waiting on regulatory feed/i);
      expect(isAllowable([result])).toBe(false);
    });

    it('missing entity → unresolved, records the missing input and blocks allow', async () => {
      const result = await entityNotSanctionedPredicate.evaluate(
        {},
        makeCtx({ regulatory_state: { ofac_sdn_list: SDN_LIST } }),
      );
      expect(result.result).toBe('stub');
      expect(result.details.unresolved).toBe(true);
      expect(result.details.missing).toEqual(['entity.id']);
      expect(isAllowable([result])).toBe(false);
    });
  });

  it('isAllowable permits a pass-only trace and rejects fail/stub traces', () => {
    const pass: CompositePredicateEvaluation[] = [{ predicate: PRED, result: 'pass', reason: '', details: {} }];
    const fail: CompositePredicateEvaluation[] = [{ predicate: PRED, result: 'fail', reason: '', details: {} }];
    const stub: CompositePredicateEvaluation[] = [{ predicate: PRED, result: 'stub', reason: '', details: {} }];
    expect(isAllowable(pass)).toBe(true);
    expect(isAllowable(fail)).toBe(false);
    expect(isAllowable(stub)).toBe(false);
  });
});
